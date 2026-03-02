import Foundation
import Security
import StoreKit

private struct BridgeRequest: Codable {
  let bundleId: String
  let productId: String
  let trialDays: Int
  let nowUnix: Int64
  let serviceName: String
  let accountName: String
}

private struct LicenseRecord: Codable {
  var trialStartedUnix: Int64
  var lastSeenUnix: Int64
  var purchased: Bool
}

private struct StatusResponse: Codable {
  let state: String
  let daysRemaining: Int?
}

private struct ProductResponse: Codable {
  let priceDisplay: String?
}

private struct PurchaseResponse: Codable {
  let success: Bool
}

private struct ErrorResponse: Codable {
  let error: String
  let type: String? // Added type
}

private enum BridgeError: Error {
  case badInput
  case unsupportedOS
  case noProduct
  case keychain(OSStatus)
  case serialization
}

private func parseErrorToTypeAndMessage(_ error: Error) -> (type: String, message: String) {
  let nsError = error as NSError
  if nsError.domain == NSURLErrorDomain && 
    (nsError.code == NSURLErrorNotConnectedToInternet || nsError.code == NSURLErrorNetworkConnectionLost) {
    return ("Offline", "No network connection")
  }
  
  if let storeError = error as? StoreKitError {
    switch storeError {
    case .networkError(_):
      return ("Offline", "StoreKit network error")
    default:
      return ("StoreFault", storeError.localizedDescription)
    }
  }

  return ("Unknown", error.localizedDescription)
}

private func encodeResponse<T: Encodable>(_ response: T) -> UnsafeMutablePointer<CChar>? {
  let encoder = JSONEncoder()
  guard let data = try? encoder.encode(response) else {
    return strdup("{\"error\":\"Failed to encode bridge response\",\"type\":\"Unknown\"}")
  }

  guard let json = String(data: data, encoding: .utf8) else {
    return strdup("{\"error\":\"Failed to serialize bridge response\",\"type\":\"Unknown\"}")
  }

  return strdup(json)
}

private func decodeRequest(_ inputJson: UnsafePointer<CChar>?) throws -> BridgeRequest {
  guard let inputJson else {
    throw BridgeError.badInput
  }

  let payload = String(cString: inputJson)
  guard let data = payload.data(using: .utf8) else {
    throw BridgeError.badInput
  }

  let decoder = JSONDecoder()
  return try decoder.decode(BridgeRequest.self, from: data)
}

private func keychainQuery(service: String, account: String) -> [String: Any] {
  [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account
  ]
}

private func readRecord(request: BridgeRequest) throws -> LicenseRecord? {
  var query = keychainQuery(service: request.serviceName, account: request.accountName)
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  query[kSecReturnData as String] = true

  var item: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &item)
  if status == errSecItemNotFound {
    return nil
  }

  guard status == errSecSuccess else {
    throw BridgeError.keychain(status)
  }

  guard let data = item as? Data else {
    throw BridgeError.serialization
  }

  return try JSONDecoder().decode(LicenseRecord.self, from: data)
}

private func writeRecord(request: BridgeRequest, record: LicenseRecord) throws {
  let data = try JSONEncoder().encode(record)
  let query = keychainQuery(service: request.serviceName, account: request.accountName)

  let updateStatus = SecItemUpdate(
    query as CFDictionary,
    [kSecValueData as String: data] as CFDictionary
  )

  if updateStatus == errSecSuccess {
    return
  }

  if updateStatus != errSecItemNotFound {
    throw BridgeError.keychain(updateStatus)
  }

  var createQuery = query
  createQuery[kSecValueData as String] = data
  createQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

  let createStatus = SecItemAdd(createQuery as CFDictionary, nil)
  guard createStatus == errSecSuccess else {
    throw BridgeError.keychain(createStatus)
  }
}

@available(macOS 12.0, *)
private enum StoreKitBridge {
  static func hasActiveEntitlement(productId: String) async -> Bool {
    for await verification in Transaction.currentEntitlements {
      guard case .verified(let transaction) = verification else {
        continue
      }

      guard transaction.productID == productId else {
        continue
      }

      guard transaction.revocationDate == nil else {
        continue
      }

      return true
    }

    return false
  }

  static func purchase(productId: String) async throws -> Bool {
    let products = try await Product.products(for: [productId])
    guard let product = products.first else {
      throw BridgeError.noProduct
    }

    let result = try await product.purchase()
    switch result {
    case .success(let verification):
      guard case .verified(let transaction) = verification else {
        return false
      }
      guard transaction.productID == productId else {
        return false
      }

      await transaction.finish()
      return true
    case .pending:
      return false
    case .userCancelled:
      return false
    @unknown default:
      return false
    }
  }

  static func restore(productId: String) async throws -> Bool {
    try await AppStore.sync()
    return await hasActiveEntitlement(productId: productId)
  }

  static func displayPrice(productId: String) async throws -> String? {
    let products = try await Product.products(for: [productId])
    guard let product = products.first else {
      return nil
    }

    return product.displayPrice
  }
}

private func runAsync<T>(_ operation: @escaping () async throws -> T) -> Result<T, Error> {
  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<T, Error>!

  Task {
    do {
      let value = try await operation()
      result = .success(value)
    } catch {
      result = .failure(error)
    }

    semaphore.signal()
  }

  semaphore.wait()
  return result
}

private func computeStatus(request: BridgeRequest) throws -> StatusResponse {
  var record = try readRecord(request: request)
    ?? LicenseRecord(trialStartedUnix: request.nowUnix, lastSeenUnix: request.nowUnix, purchased: false)

  // 2.2 — Clock Skew / Trial Manipulation Mitigation
  let isClockTampered = request.nowUnix < (record.lastSeenUnix - 300)

  if request.nowUnix > record.lastSeenUnix {
    record.lastSeenUnix = request.nowUnix
  }

  if #available(macOS 12.0, *) {
    let entitlementResult = runAsync {
      await StoreKitBridge.hasActiveEntitlement(productId: request.productId)
    }

    // 1.1 — Fix the Revocation / Refund Bypass Bug
    if case .success(let purchasedFromStore) = entitlementResult {
      if purchasedFromStore {
        record.purchased = true
      } else {
        record.purchased = false
      }
    }
  }

  try writeRecord(request: request, record: record)

  if isClockTampered {
    return StatusResponse(state: "expired", daysRemaining: nil)
  }

  if record.purchased {
    return StatusResponse(state: "purchased", daysRemaining: nil)
  }

  let elapsedDays = max(0, (record.lastSeenUnix - record.trialStartedUnix) / 86_400)
  if elapsedDays < Int64(request.trialDays) {
    return StatusResponse(
      state: "trial",
      daysRemaining: Int(Int64(request.trialDays) - elapsedDays)
    )
  }

  return StatusResponse(state: "expired", daysRemaining: nil)
}

@_cdecl("glance_macos_check_status")
public func glance_macos_check_status(_ inputJson: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
  do {
    let request = try decodeRequest(inputJson)
    let response = try computeStatus(request: request)
    return encodeResponse(response)
  } catch {
    let (errType, message) = parseErrorToTypeAndMessage(error)
    return encodeResponse(ErrorResponse(error: "Failed to check StoreKit/Keychain license state: \(message)", type: errType))
  }
}

@_cdecl("glance_macos_purchase_unlock")
public func glance_macos_purchase_unlock(_ inputJson: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
  do {
    let request = try decodeRequest(inputJson)

    guard #available(macOS 12.0, *) else {
      throw BridgeError.unsupportedOS
    }

    let purchaseResult = runAsync {
      try await StoreKitBridge.purchase(productId: request.productId)
    }

    guard case .success(let success) = purchaseResult else {
      if case .failure(let error) = purchaseResult {
        throw error
      }
      return encodeResponse(PurchaseResponse(success: false))
    }

    if success {
      var record = try readRecord(request: request)
        ?? LicenseRecord(trialStartedUnix: request.nowUnix, lastSeenUnix: request.nowUnix, purchased: false)
      record.purchased = true
      record.lastSeenUnix = max(record.lastSeenUnix, request.nowUnix)
      try writeRecord(request: request, record: record)
    }

    return encodeResponse(PurchaseResponse(success: success))
  } catch {
    let (errType, message) = parseErrorToTypeAndMessage(error)
    return encodeResponse(ErrorResponse(error: "Failed to complete StoreKit purchase: \(message)", type: errType))
  }
}

@_cdecl("glance_macos_restore_purchases")
public func glance_macos_restore_purchases(_ inputJson: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
  do {
    let request = try decodeRequest(inputJson)

    guard #available(macOS 12.0, *) else {
      throw BridgeError.unsupportedOS
    }

    let restoreResult = runAsync {
      try await StoreKitBridge.restore(productId: request.productId)
    }

    guard case .success(let success) = restoreResult else {
      if case .failure(let error) = restoreResult {
        throw error
      }
      return encodeResponse(PurchaseResponse(success: false))
    }

    if success {
      var record = try readRecord(request: request)
        ?? LicenseRecord(trialStartedUnix: request.nowUnix, lastSeenUnix: request.nowUnix, purchased: false)
      record.purchased = true
      record.lastSeenUnix = max(record.lastSeenUnix, request.nowUnix)
      try writeRecord(request: request, record: record)
    }

    return encodeResponse(PurchaseResponse(success: success))
  } catch {
    let (errType, message) = parseErrorToTypeAndMessage(error)
    return encodeResponse(ErrorResponse(error: "Failed to restore purchases: \(message)", type: errType))
  }
}

@_cdecl("glance_macos_get_product")
public func glance_macos_get_product(_ inputJson: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
  do {
    let request = try decodeRequest(inputJson)

    guard #available(macOS 12.0, *) else {
      throw BridgeError.unsupportedOS
    }

    let priceResult = runAsync {
      try await StoreKitBridge.displayPrice(productId: request.productId)
    }

    guard case .success(let displayPrice) = priceResult else {
      if case .failure(let error) = priceResult {
        throw error
      }
      return encodeResponse(ProductResponse(priceDisplay: nil))
    }

    return encodeResponse(ProductResponse(priceDisplay: displayPrice))
  } catch {
    let (errType, message) = parseErrorToTypeAndMessage(error)
    return encodeResponse(ErrorResponse(error: "Failed to fetch StoreKit product metadata: \(message)", type: errType))
  }
}

@_cdecl("glance_macos_free_string")
public func glance_macos_free_string(_ pointer: UnsafeMutablePointer<CChar>?) {
  guard let pointer else {
    return
  }

  free(pointer)
}
