import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientRoutes } from "../routes/clients.js";
import { errorHandler } from "../middleware/index.js";

const mockClientService = vi.hoisted(() => ({
  getById: vi.fn(),
  getEmailDomainById: vi.fn(),
  getEmployeeById: vi.fn(),
  createEmailDomain: vi.fn(),
  removeEmailDomain: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  removeEmployee: vi.fn(),
  listEmailDomains: vi.fn(),
  listEmployees: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  clientService: () => mockClientService,
  clientInstructionsService: () => ({}),
  logActivity: mockLogActivity,
}));

function createApp(companyIds: string[] = ["company-1"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds,
      source: "user_session",
      isInstanceAdmin: false,
      memberships: companyIds.map((id) => ({
        companyId: id,
        status: "active",
        membershipRole: "member",
      })),
    };
    next();
  });
  app.use("/api", clientRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("client employee and email-domain routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cross-company access on /clients/:id/employees", async () => {
    mockClientService.getById.mockResolvedValue({
      id: "client-1",
      companyId: "company-other",
      name: "Acme",
    });

    const res = await request(createApp()).get("/api/clients/client-1/employees");
    expect(res.status).toBe(403);
    expect(mockClientService.listEmployees).not.toHaveBeenCalled();
  });

  it("rejects cross-company access on DELETE /client-email-domains/:id", async () => {
    mockClientService.getEmailDomainById.mockResolvedValue({
      id: "domain-1",
      companyId: "company-other",
      clientId: "client-1",
      domain: "client.com",
    });

    const res = await request(createApp()).delete("/api/client-email-domains/domain-1");
    expect(res.status).toBe(403);
    expect(mockClientService.removeEmailDomain).not.toHaveBeenCalled();
  });

  it("rejects cross-company access on PATCH /client-employees/:id", async () => {
    mockClientService.getEmployeeById.mockResolvedValue({
      id: "employee-1",
      companyId: "company-other",
      clientId: "client-1",
      name: "Ana",
      role: "TI",
      email: "ana@client.com",
      projectScope: "all_linked_projects",
      projectLinks: [],
    });

    const res = await request(createApp())
      .patch("/api/client-employees/employee-1")
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
    expect(mockClientService.updateEmployee).not.toHaveBeenCalled();
  });

  it("validates payload on POST /clients/:id/email-domains", async () => {
    mockClientService.getById.mockResolvedValue({
      id: "client-1",
      companyId: "company-1",
      name: "Acme",
    });

    const res = await request(createApp())
      .post("/api/clients/client-1/email-domains")
      .send({ domain: "not a domain" });
    expect(res.status).toBe(400);
    expect(mockClientService.createEmailDomain).not.toHaveBeenCalled();
  });

  it("rejects unknown keys on PATCH /client-employees/:id (strict schema)", async () => {
    mockClientService.getEmployeeById.mockResolvedValue({
      id: "employee-1",
      companyId: "company-1",
      clientId: "client-1",
      name: "Ana",
      role: "TI",
      email: "ana@client.com",
      projectScope: "all_linked_projects",
      projectLinks: [],
    });

    const res = await request(createApp())
      .patch("/api/client-employees/employee-1")
      .send({ name: "Renamed", clientId: "client-other" });
    expect(res.status).toBe(400);
    expect(mockClientService.updateEmployee).not.toHaveBeenCalled();
  });
});
