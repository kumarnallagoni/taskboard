# TaskBoard Architecture and Setup

## Overview

This project is a Next.js full-stack task management app built around PostgreSQL and Prisma. The app manages users, projects, memberships, and tasks with role-based access control.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Prisma 6 + PostgreSQL
- TanStack Query for client data fetching
- Zod for request validation
- JWT + bcryptjs for auth
- Vitest for tests

## Core data model

The Prisma schema centers on four main entities:

- User: account, profile, and ownership/assignment relationships
- Project: project container
- Membership: join table linking users to projects with role (`admin`, `member`, `viewer`)
- Task: project task with status (`todo`, `in_progress`, `review`, `done`), assignee, creator, and ordering

Important relationships:

- `User` has many `Membership`s and can own or be assigned tasks.
- `Project` has many `Task`s and many `Membership`s.
- `Task` belongs to one project and may have one assignee and one creator.

## Auth flow

Authentication is JWT-based.

- `src/app/api/auth/register/route.ts`: validates input, hashes password with `bcryptjs`, creates user, signs JWT.
- `src/app/api/auth/login/route.ts`: verifies password, signs JWT for the authenticated user.
- `src/lib/jwt.ts`: creates and verifies JWTs using `JWT_SECRET`.
- `src/lib/auth.ts`: reads the `Authorization: Bearer ...` header, verifies the token, loads the user from Prisma, and exposes role helpers.

Access checks follow this pattern:

- `getCurrentUser(req)` verifies the token and returns a safe user object.
- `getProjectMembership(userId, projectId)` looks up the user’s role for that project.
- `canEditTasks(role)` allows `admin` and `member` to create/update/delete tasks; `viewer` is blocked.

## Main task workflow

The task lifecycle is primarily handled through the API routes under `src/app/api`:

1. A user logs in and receives a JWT.
2. Subsequent requests include the JWT in the `Authorization` header.
3. `getCurrentUser()` verifies it and loads the current user.
4. The API checks whether the user belongs to the project and what role they have.
5. Task create and update actions validate request payloads with Zod schemas.
6. Tasks are ordered by `status` and `position`, and new tasks are appended to the end of the relevant column.

### Task endpoints

- `GET /api/projects/[id]/tasks`: lists tasks for a project, optionally filtering by search query.
- `POST /api/projects/[id]/tasks`: creates a task, checks membership and permissions, assigns a `position` at the end of the selected status column.
- `PATCH /api/tasks/[id]`: updates an existing task record.
- `DELETE /api/tasks/[id]`: deletes a task after confirming access.

## Setup commands

### Docker (recommended)

```bash
# Clone and enter the repo
git clone <repo-url> && cd taskboard

# Start app + database
docker-compose up --build

# In a second terminal
docker-compose exec web npm run db:seed

# Run the test suite
docker-compose exec web npm test
```

The app runs at: `http://localhost:3000`

### Manual setup

```bash
# install dependencies
npm install

# configure local env file
cp .env.example .env
# then update DATABASE_URL for your local PostgreSQL

# generate Prisma client and run migrations
npx prisma migrate deploy
npx prisma generate

# seed demo data
npm run db:seed

# run tests
npm test

# start dev server
npm run dev
```

## Useful scripts

From `package.json`:

- `npm run dev`: start Next.js dev server
- `npm run build`: production build
- `npm run test`: run Vitest
- `npm run db:generate`: generate Prisma client
- `npm run db:migrate`: apply migrations
- `npm run db:seed`: seed sample data
- `npm run db:reset`: reset DB and reseed

## Notes

The seed data creates demo users and realistic project/task examples. All seeded users share the password `password123`.

This app is organized around a simple pattern: route handlers validate requests, check auth/roles, then interact with Prisma before returning JSON responses to the client.
