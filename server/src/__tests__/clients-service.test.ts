import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clientEmployeeProjectLinks,
  clientEmployees,
  clients,
  clientEmailDomains,
  clientProjects,
  companies,
  createDb,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { clientService } from "../services/clients.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres client service tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("clientService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof clientService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const projectId = randomUUID();
  const secondProjectId = randomUUID();
  const otherProjectId = randomUUID();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-clients-service-");
    db = createDb(tempDb.connectionString);
    svc = clientService(db);

    await db.insert(companies).values([
      {
        id: companyId,
        name: "TestCo",
        issuePrefix: "TST",
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "OtherCo",
        issuePrefix: "OTH",
        requireBoardApprovalForNewAgents: false,
      },
    ]);

    await db.insert(projects).values([
      {
        id: projectId,
        companyId,
        name: "Relationship Project",
        status: "planned",
      },
      {
        id: secondProjectId,
        companyId,
        name: "Second Relationship Project",
        status: "planned",
      },
      {
        id: otherProjectId,
        companyId: otherCompanyId,
        name: "Other Project",
        status: "planned",
      },
    ]);
  }, 20_000);

  afterEach(async () => {
    await db.delete(clientEmployeeProjectLinks);
    await db.delete(clientEmployees);
    await db.delete(clientEmailDomains);
    await db.delete(clientProjects);
    await db.delete(clients);
  });

  afterAll(async () => {
    await db.delete(projects);
    await db.delete(companies);
    await tempDb?.cleanup();
  });

  it("creates a client with optional metadata", async () => {
    const client = await svc.create(companyId, {
      name: "Acme Corp",
      email: "acme@example.com",
      metadata: { cnpj: "12.345.678/0001-00" },
    });

    expect(client).toBeDefined();
    expect(client!.name).toBe("Acme Corp");
    expect(client!.email).toBe("acme@example.com");
    expect(client!.metadata).toEqual({ cnpj: "12.345.678/0001-00" });
    expect(client!.companyId).toBe(companyId);
    expect(client!.status).toBe("active");
  });

  it("lists clients ordered by name with derived relationship counts", async () => {
    const zeta = await svc.create(companyId, { name: "Zeta Corp" });
    const alpha = await svc.create(companyId, { name: "Alpha Inc" });

    await svc.createProject(companyId, {
      clientId: alpha!.id,
      projectId,
      status: "active",
    });

    const result = await svc.list(companyId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.data[0]!.name).toBe("Alpha Inc");
    expect(result.data[0]!.linkedProjectCount).toBe(1);
    expect(result.data[0]!.activeProjectCount).toBe(1);
    expect(result.data[1]!.name).toBe("Zeta Corp");
    expect(result.data[1]!.linkedProjectCount).toBe(0);
    expect(zeta).toBeDefined();
  });

  it("supports pagination with limit and offset", async () => {
    await svc.create(companyId, { name: "A Corp" });
    await svc.create(companyId, { name: "B Corp" });
    await svc.create(companyId, { name: "C Corp" });

    const page1 = await svc.list(companyId, { limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.data[0]!.name).toBe("A Corp");

    const page2 = await svc.list(companyId, { limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.total).toBe(3);
    expect(page2.data[0]!.name).toBe("C Corp");
  });

  it("gets a client by id with derived relationship counts", async () => {
    const created = await svc.create(companyId, { name: "ById Corp" });
    await svc.createProject(companyId, {
      clientId: created!.id,
      projectId,
      status: "paused",
    });

    const found = await svc.getById(created!.id, companyId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("ById Corp");
    expect(found!.linkedProjectCount).toBe(1);
    expect(found!.activeProjectCount).toBe(0);
  });

  it("updates a client without dropping derived counts", async () => {
    const created = await svc.create(companyId, { name: "Old Name" });
    const updated = await svc.update(created!.id, companyId, {
      name: "New Name",
      email: "new@example.com",
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("New Name");
    expect(updated!.email).toBe("new@example.com");
  });

  it("removes a client and cascades to client_projects", async () => {
    const client = await svc.create(companyId, { name: "To Delete" });
    await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
    });

    const projectsBefore = await svc.listProjects(client!.id, companyId);
    expect(projectsBefore).toHaveLength(1);

    await svc.remove(client!.id, companyId);

    const found = await svc.getById(client!.id, companyId);
    expect(found).toBeNull();

    const projectsAfter = await svc.listProjects(client!.id, companyId);
    expect(projectsAfter).toHaveLength(0);
  });

  it("creates and lists a client project with joined project name, project status, and metadata", async () => {
    const client = await svc.create(companyId, { name: "Link Test" });
    await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
      status: "active",
      metadata: {
        legacyProjectType: "consultoria",
      },
      tags: ["python", "sql"],
      projectAliases: ["ABC", "DFG", "abc"],
    });

    const linked = await svc.listProjects(client!.id, companyId);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.projectName).toBe("Relationship Project");
    expect(linked[0]!.status).toBe("planned");
    expect(linked[0]!.metadata).toEqual({ legacyProjectType: "consultoria" });
    expect(linked[0]!.tags).toEqual(["python", "sql"]);
    expect(linked[0]!.projectAliases).toEqual(["ABC", "DFG"]);
  });

  it("rejects duplicate client project links", async () => {
    const client = await svc.create(companyId, { name: "Duplicate Link" });
    await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
    });

    await expect(
      svc.createProject(companyId, {
        clientId: client!.id,
        projectId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects cross-company project links", async () => {
    const client = await svc.create(companyId, { name: "Cross Company" });

    await expect(
      svc.createProject(companyId, {
        clientId: client!.id,
        projectId: otherProjectId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("updates a client project but keeps project and client immutable", async () => {
    const client = await svc.create(companyId, { name: "Update Link" });
    const otherClient = await svc.create(companyId, { name: "Other Link" });
    const cp = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
      status: "paused",
    });

    const updated = await svc.updateProject(cp!.id, companyId, {
      status: "active",
      description: "Updated relationship",
      projectAliases: ["Internal Alpha", "internal alpha", "DFG"],
    });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("planned");
    expect(updated!.description).toBe("Updated relationship");
    expect(updated!.projectAliases).toEqual(["Internal Alpha", "DFG"]);

    await expect(
      svc.updateProject(cp!.id, companyId, { clientId: otherClient!.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("removes a client project", async () => {
    const client = await svc.create(companyId, { name: "Unlink Test" });
    const cp = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
    });

    await svc.removeProject(cp!.id, companyId);
    const linked = await svc.listProjects(client!.id, companyId);
    expect(linked).toHaveLength(0);
  });

  it("normalizes client email examples to unique company domains", async () => {
    const client = await svc.create(companyId, { name: "Domain Client" });

    const created = await svc.createEmailDomain(companyId, client!.id, "X@Client.COM");

    expect(created).toBeDefined();
    expect(created!.domain).toBe("client.com");

    const domains = await svc.listEmailDomains(client!.id, companyId);
    expect(domains).toHaveLength(1);
    expect(domains[0]!.domain).toBe("client.com");

    await expect(
      svc.createEmailDomain(companyId, client!.id, "client.com"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects invalid and cross-company client email domains", async () => {
    const client = await svc.create(companyId, { name: "Domain Client" });

    await expect(
      svc.createEmailDomain(companyId, client!.id, "not-a-domain"),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      svc.createEmailDomain(otherCompanyId, client!.id, "client.com"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("removes client email domains", async () => {
    const client = await svc.create(companyId, { name: "Domain Client" });
    const created = await svc.createEmailDomain(companyId, client!.id, "client.com");

    await svc.removeEmailDomain(created!.id, companyId);

    const domains = await svc.listEmailDomains(client!.id, companyId);
    expect(domains).toHaveLength(0);
  });

  it("creates client employees scoped to all linked projects", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    const employee = await svc.createEmployee(companyId, client!.id, {
      name: "Ana Silva",
      role: "TI",
      email: "Ana@Client.com",
      projectScope: "all_linked_projects",
    });

    expect(employee).toBeDefined();
    expect(employee!.name).toBe("Ana Silva");
    expect(employee!.role).toBe("TI");
    expect(employee!.email).toBe("ana@client.com");
    expect(employee!.projectScope).toBe("all_linked_projects");
    expect(employee!.projectLinks).toEqual([]);

    const employees = await svc.listEmployees(client!.id, companyId);
    expect(employees).toHaveLength(1);
    expect(employees[0]!.email).toBe("ana@client.com");
  });

  it("creates and updates client employees scoped to selected linked projects", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    const linkedProject = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
      projectNameOverride: "Internal Portal",
    });

    const employee = await svc.createEmployee(companyId, client!.id, {
      name: "Bruno User",
      role: "User",
      email: "bruno@client.com",
      projectScope: "selected_projects",
      clientProjectIds: [linkedProject!.id],
    });

    expect(employee).toBeDefined();
    expect(employee!.projectScope).toBe("selected_projects");
    expect(employee!.projectLinks).toHaveLength(1);
    expect(employee!.projectLinks[0]).toMatchObject({
      clientProjectId: linkedProject!.id,
      projectId,
      projectNameOverride: "Internal Portal",
    });

    const updated = await svc.updateEmployee(employee!.id, companyId, {
      role: "Director",
      projectScope: "all_linked_projects",
      clientProjectIds: [],
    });

    expect(updated).toBeDefined();
    expect(updated!.role).toBe("Director");
    expect(updated!.projectScope).toBe("all_linked_projects");
    expect(updated!.projectLinks).toEqual([]);
  });

  it("rejects selected employee projects that are not linked to the client", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });

    await expect(
      svc.createEmployee(companyId, client!.id, {
        name: "Bad Link",
        role: "User",
        email: "bad@client.com",
        projectScope: "selected_projects",
        clientProjectIds: [projectId],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects duplicate client employee emails within one client", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    await svc.createEmployee(companyId, client!.id, {
      name: "First",
      role: "User",
      email: "person@client.com",
    });

    await expect(
      svc.createEmployee(companyId, client!.id, {
        name: "Second",
        role: "Director",
        email: "PERSON@client.com",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects removing the only selected project for a client employee", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    const linkedProject = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
    });
    const employee = await svc.createEmployee(companyId, client!.id, {
      name: "Scoped User",
      role: "User",
      email: "scoped@client.com",
      projectScope: "selected_projects",
      clientProjectIds: [linkedProject!.id],
    });

    await expect(svc.removeProject(linkedProject!.id, companyId)).rejects.toMatchObject({ status: 409 });

    const found = await svc.getEmployeeById(employee!.id, companyId);
    expect(found).toBeDefined();
    expect(found!.projectScope).toBe("selected_projects");
    expect(found!.projectLinks).toHaveLength(1);
    expect(found!.projectLinks[0]!.clientProjectId).toBe(linkedProject!.id);
  });

  it("removes selected employee project links when another selected project remains", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    const firstProject = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId,
    });
    const secondProject = await svc.createProject(companyId, {
      clientId: client!.id,
      projectId: secondProjectId,
    });
    const employee = await svc.createEmployee(companyId, client!.id, {
      name: "Scoped User",
      role: "User",
      email: "scoped@client.com",
      projectScope: "selected_projects",
      clientProjectIds: [firstProject!.id, secondProject!.id],
    });

    await svc.removeProject(firstProject!.id, companyId);

    const found = await svc.getEmployeeById(employee!.id, companyId);
    expect(found).toBeDefined();
    expect(found!.projectScope).toBe("selected_projects");
    expect(found!.projectLinks).toHaveLength(1);
    expect(found!.projectLinks[0]!.clientProjectId).toBe(secondProject!.id);
  });

  it("removes client employees when a client is removed", async () => {
    const client = await svc.create(companyId, { name: "Employee Client" });
    const employee = await svc.createEmployee(companyId, client!.id, {
      name: "Remove Me",
      role: "User",
      email: "remove@client.com",
    });

    await svc.remove(client!.id, companyId);

    const found = await svc.getEmployeeById(employee!.id, companyId);
    expect(found).toBeNull();
  });
});
