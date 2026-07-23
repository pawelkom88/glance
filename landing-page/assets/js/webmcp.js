/**
 * WebMCP (Web Model Context Protocol) Integration for Glance
 * Exposes WebMCP tools to browser-based AI Agents via navigator.modelContext
 */
(function () {
  if (typeof window === 'undefined') return;

  const tools = [
    {
      name: "get_glance_download_links",
      description: "Returns the official Glance download links for macOS (Apple Silicon / Intel) and Windows.",
      inputSchema: {
        type: "object",
        properties: {}
      },
      execute: async () => {
        return {
          macOS: "https://atglance.app/download/mac",
          macOSIntel: "https://atglance.app/download/mac-intel",
          windows: "https://atglance.app/download/win"
        };
      }
    },
    {
      name: "get_script_template",
      description: "Returns a Markdown teleprompter template by category.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Template category: zoom-presentation, sales-discovery-call, product-demo, webinar, team-update, job-interview-notes"
          }
        },
        required: ["category"]
      },
      execute: async (args) => {
        const templates = {
          "zoom-presentation": "# Presentation Title\n\n## OPEN\n- Hook & Outcome\n\n## SECTION 1: CURRENT STATE\n- Metrics & Pain points\n\n## CLOSE\n- Action plan & Q&A",
          "sales-discovery-call": "# Sales Discovery\n\n## SITUATION\n- Current workflow\n\n## PAIN\n- Primary bottlenecks\n\n## NEXT STEPS\n- Technical demo schedule",
          "product-demo": "# Product Demo\n\n## WORKFLOW\n- Feature highlight\n\n## WRAP\n- Summary & Questions",
          "webinar": "# Webinar Keynote\n\n## INTRO\n- Housekeeping & Agenda\n\n## PILLARS\n- Core concepts\n\n## Q&A\n- Live questions",
          "team-update": "# Team Update\n\n## WINS\n- Weekly milestones\n\n## FOCUS\n- Next week priorities",
          "job-interview-notes": "# Interview Notes\n\n## STAR STORY 1\n- Situation, Task, Action, Result\n\n## QUESTIONS\n- 90 day goals"
        };
        return {
          category: args.category,
          template: templates[args.category] || templates["zoom-presentation"]
        };
      }
    }
  ];

  // Expose WebMCP standard API if supported by browser/agent extension
  if (navigator.modelContext && typeof navigator.modelContext.provideContext === 'function') {
    try {
      navigator.modelContext.provideContext({
        name: "Glance WebMCP",
        tools: tools
      });
    } catch (e) {
      console.warn("WebMCP registration note:", e);
    }
  } else {
    // Expose global fallback context object for agents inspecting window.webMCP or window.modelContext
    window.webMCP = {
      name: "Glance WebMCP",
      tools: tools
    };
  }
})();
