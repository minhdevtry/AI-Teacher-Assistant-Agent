# Coding Rules & Conventions

## Naming Conventions

### Database (Prisma / Supabase)
- **CamelCase** for all table names and column names
- **NO foreign keys** — tables are linked via Code fields (varchar 24)
- **Soft delete** via `IsActive` flag (0 = deleted, 1 = active) — never hard delete
- **Id** — int auto-increment starting at 1
- Standard audit columns on every table: `Id`, `Name`, `Code`, `Description`, `CreatedAt`, `ModifiedAt`, `IsActive`

### TypeScript / NestJS
- **PascalCase** for classes: `UsersService`, `ZaloModule`
- **camelCase** for methods and properties: `findUser`, `userName`
- **UPPER_SNAKE_CASE** for constants: `MAX_RETRY_COUNT`
- **kebab-case** for file names: `users.service.ts`, `zalo.module.ts`

## NestJS Patterns

### Module Structure
- Each domain module has: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `dto/`
- Use `@nestjs/config` ConfigModule globally (`isGlobal: true`)
- Use dependency injection exclusively — no manual instantiation
- `@Global()` on MastraModule to make agents/workflows available everywhere

### Controllers
- Use `@ApiTags()` decorator for Swagger grouping
- Use `@ApiOperation()`, `@ApiParam()`, `@ApiBody()`, `@ApiResponse()` on every endpoint
- Use DTOs with `class-validator` for request validation
- Return typed responses via `BaseResponseDto`

### Services
- Keep services focused on single responsibility
- Use `@Injectable()` decorator
- Every service has a `Logger` instance: `private readonly logger = new Logger(ServiceName.name)`
- All Supabase errors are caught and re-thrown as `InternalServerErrorException` (or `NotFoundException`, `BadRequestException` where appropriate)
- Log important operations: create, update, delete, confirm

## Error Handling

- **Domain services**: throw `NotFoundException` for missing entities, `BadRequestException` for invalid state transitions, `InternalServerErrorException` for Supabase failures
- **Agent router**: graceful degradation — if AI model is unavailable, default intent to "other"
- **Workflows**: each workflow step wrapped in try/catch, returns error messages instead of crashing
- **Webhook controller**: never crashes on malformed input — logs error and sends fallback response to user
- **All async operations**: wrapped in try/catch with structured logging

## Code Style

- **TypeScript strict mode** enabled
- Use `async/await` — no raw Promises or callbacks
- Use `readonly` for constructor-injected dependencies
- Prefer interfaces over type aliases for object shapes
- Use Zod schemas for runtime validation (Mastra tools)
- Use class-validator decorators for DTOs (NestJS controllers)
- ESLint configured via `eslint.config.mjs`
- Prettier formatting via `.prettierrc`

## Logging

- Use NestJS built-in `Logger` (not `console.log`)
- Log important events: webhook received, agent invoked, workflow triggered, payment confirmed/rejected
- Don't over-log — keep it clean and actionable
- Use `logger.error()` for failures, `logger.warn()` for non-critical issues, `logger.log()` for operations, `logger.debug()` for verbose output

## Git Conventions

- Commit messages: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
- Never commit `.env` files or secrets (included in `.gitignore`)
- Branch naming: `feature/xxx`, `fix/xxx`, `chore/xxx`

## Architecture Rules

1. **Channel-agnostic agents** — AI agents never import channel-specific code
2. **Domain services are pure** — No HTTP/Zalo concerns, only business logic
3. **Workflows from services** — Mastra workflows trigger from NestJS services (WorkflowTriggerService), not agent tools
4. **Config in code/env** — Google Sheets config lives in env vars, not database
5. **Code-based linkage** — Tables reference each other via Code fields (e.g., `ClassCode`, `StudentCode`), not foreign keys
6. **Human-in-the-loop** — Payment drafts require teacher approval before confirmation
7. **AI intent classification** — OrchestratorAgent classifies user intent dynamically (no hardcoded keyword matching)
8. **Background jobs** — BullMQ for async operations (Google Sheets sync), with exponential backoff retries

## Environment

- Node.js 22+ required
- Use `.env` for all environment variables (loaded by `@nestjs/config`)
- Never hardcode URLs, tokens, or keys in source files
- Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ZALO_BOT_TOKEN`, `AI_API_KEY`
- Optional env vars: `GOOGLE_SHEETS_*`, `REDIS_HOST`, `REDIS_PORT`
