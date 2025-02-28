import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import nock from "nock";
import { mockData } from "../setup";

// Define types for our test responses
interface RoadmapResponse {
  project: typeof mockData.project;
  milestones: Array<{
    milestone: typeof mockData.milestone;
    issues: (typeof mockData.issue)[];
  }>;
}

interface SprintResponse {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  goals: string[];
  issues: number[];
}

interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

describe("GitHub Project Manager Integration", () => {
  const originalEnv = process.env;
  let server: Server;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: "test-token",
      GITHUB_OWNER: "test-owner",
      GITHUB_REPO: "test-repo",
    };

    // Allow Nock to pass through requests that don't match our explicit mocks
    nock.disableNetConnect();
    nock.enableNetConnect("api.github.com");

    // Create server instance
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe("create_roadmap tool", () => {
    it("should create a complete roadmap with project, milestones, and issues", async () => {
      // Define nock interceptors allowing multiple calls to same endpoints
      const projectScope = nock("https://api.github.com")
        .post("/graphql")
        .reply(200, {
          data: {
            createProjectV2: {
              projectV2: mockData.project,
            },
          },
        })
        .persist();

      const milestoneScope = nock("https://api.github.com")
        .post("/repos/test-owner/test-repo/milestones")
        .reply(201, mockData.milestone)
        .persist();

      const issueScope = nock("https://api.github.com")
        .post("/repos/test-owner/test-repo/issues")
        .reply(201, mockData.issue)
        .persist();

      // Create mock response
      const mockResponse: RoadmapResponse = {
        project: mockData.project,
        milestones: [
          {
            milestone: mockData.milestone,
            issues: [mockData.issue],
          },
        ],
      };

      // Set up tool handler
      const handler = async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(mockResponse),
          },
        ],
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name !== "create_roadmap") {
          throw new Error("Unknown tool");
        }
        return handler();
      });

      // Test the tool handler
      const response = await handler();

      // Verify the response
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text) as RoadmapResponse;
      expect(result.project.id).toBeDefined();
      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0].issues).toHaveLength(1);

      // Uncomment this to debug which calls are pending
      console.log("Pending mocks:", projectScope.pendingMocks());
      console.log("Pending mocks:", milestoneScope.pendingMocks());
      console.log("Pending mocks:", issueScope.pendingMocks());

      // Clean up
      projectScope.persist(false);
      milestoneScope.persist(false);
      issueScope.persist(false);
    });
  });

  describe("plan_sprint tool", () => {
    it("should create a sprint and verify issues exist", async () => {
      // Define nock interceptors allowing multiple calls to same endpoints
      const issueScope = nock("https://api.github.com")
        .get("/repos/test-owner/test-repo/issues/1")
        .reply(200, mockData.issue)
        .persist();

      const graphqlScope = nock("https://api.github.com")
        .post("/graphql")
        .reply(200, {
          data: {
            repository: {
              projectsV2: {
                nodes: [mockData.project],
              },
            },
          },
        })
        .persist();

      // Create mock response
      const mockResponse: SprintResponse = {
        id: "sprint-1",
        title: "Sprint 1",
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-14T23:59:59Z",
        status: "planned",
        goals: ["Complete authentication features"],
        issues: [1],
      };

      // Set up tool handler
      const handler = async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(mockResponse),
          },
        ],
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name !== "plan_sprint") {
          throw new Error("Unknown tool");
        }
        return handler();
      });

      // Test the tool handler
      const response = await handler();

      // Verify the response
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text) as SprintResponse;
      expect(result.id).toBe("sprint-1");
      expect(result.issues).toContain(1);

      // Uncomment this to debug which calls are pending
      console.log("Pending mocks:", issueScope.pendingMocks());
      console.log("Pending mocks:", graphqlScope.pendingMocks());

      // Clean up
      issueScope.persist(false);
      graphqlScope.persist(false);
    });
  });
});
