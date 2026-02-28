import type { DetectedMonitor } from '../../../types';

export const dualMonitors: readonly DetectedMonitor[] = [
  {
    name: 'Built-in Retina Display',
    displayName: 'Built-in Retina Display',
    width: 3024,
    height: 1964,
    compositeKey: 'Built-in Retina Display|3024x1964|0,0',
    scaleFactor: 2,
    isPrimary: true,
    positionX: 0,
    positionY: 0,
    logicalWidth: 1512,
    logicalHeight: 982
  },
  {
    name: 'DELL U2722D',
    displayName: 'DELL U2722D',
    width: 1920,
    height: 1080,
    compositeKey: 'DELL U2722D|1920x1080|1512,0',
    scaleFactor: 1,
    isPrimary: false,
    positionX: 1512,
    positionY: 0,
    logicalWidth: 1920,
    logicalHeight: 1080
  }
];

export const singleMonitor: readonly DetectedMonitor[] = [dualMonitors[0]];
