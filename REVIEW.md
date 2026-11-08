# Backend Review

Evidence basis: this review is based on static code inspection of the current backend routes, Prisma schema, and auth flow. No database reset, runtime exploit execution, or mutation was performed; the findings below are code-evidence findings, not runtime-verified bug reports.

## Priority 1: Missing authorization check on task update

Category: Security

Files / lines:

- src/app/api/tasks/[id]/route.ts:16-37
- src/lib/auth.ts:19-35

Description:
The `PATCH` handler authenticates the caller and loads the task by ID, but it never checks whether the current user belongs to the task’s project or has an allowed role before calling `prisma.task.update`. The `DELETE` route performs the correct membership check, which highlights that the update path is inconsistent and bypassable. This allows any authenticated user who knows or guesses a task ID to change status, title, description, or assignee values outside their project scope.

Recommended fix:
Require a project membership/permission check before any task update, using the existing `getProjectMembership` and `canEditTasks` helpers. Verify `existing.projectId` and reject unauthorized calls with `403`, and validate `assigneeId` against project membership as part of the same guard.

## Priority 2: SQL injection in task search query

Category: Security

Files / lines:

- src/app/api/projects/[id]/tasks/route.ts:23-35

Description:
The GET route interpolates the raw `q` search term directly into a SQL string and executes it with `prisma.$queryRawUnsafe`. Because the query is constructed with string concatenation instead of Prisma parameter binding, attacker-controlled values can break out of the search expression and alter the query logic. This is a direct injection risk and can lead to unauthorized data exposure or data manipulation in the PostgreSQL database.

Recommended fix:
Replace the raw SQL search with Prisma filtering, for example `findMany` with an `OR` condition using `title: { contains: q, mode: 'insensitive' }` and the same for `description`. If a raw query is required, use parameterized query execution instead of string interpolation.

## Priority 3: Unvalidated task assignee assignment can cross project boundaries

Category: Data integrity

Files / lines:

- src/app/api/projects/[id]/tasks/route.ts:49-88
- src/schemas/task.ts:6-22

Description:
The create and update task APIs accept `assigneeId` directly from the request body, but there is no check that the assignee is actually a member of the same project. Since the task relation is tied to `projectId` and `assigneeId` is optional, this creates a data integrity flaw where tasks can be assigned to users who are outside the project’s access boundary. This breaks role and ownership assumptions, makes reporting unreliable, and can leak sensitive task assignment information to users who should not have access.

Recommended fix:
Before creating or updating a task, verify that `assigneeId` is either null or a member of the same `projectId` via `Membership` records. Reject invalid assignments with `400` or `403`, and add the same validation in both the create and patch flows.

## Priority 4: Duplicate email accounts are possible because the schema does not enforce uniqueness

Category: Data integrity

Files / lines:

- prisma/schema.prisma:23-36
- src/app/api/auth/register/route.ts:14-26

Description:
The `User.email` field is defined as a plain `String` without `@unique`, while registration relies on a non-transactional `findFirst` check before `create`. This means two concurrent registration requests can both pass the check and create duplicate users for the same email address, which breaks authentication semantics and creates ambiguous account ownership. The business impact is significant because account recovery, auditing, and access control become unreliable once duplicate identities exist.

Recommended fix:
Add a database-level unique constraint on `email` (`email String @unique`) and normalize email values before lookup/creation. Also perform the account-existence check in a transactional pattern or rely on the database uniqueness error as the authoritative guard.

## Overall assessment

This project has a solid app structure and a straightforward Prisma-based design, but the current backend security checks are not consistently enforced. The biggest risks are authorization bypass in task updates, SQL injection in project task search, and unvalidated cross-project assignment logic. These are high-impact issues because they directly affect task confidentiality, data integrity, and trust in the access-control model.
