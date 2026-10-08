# Architectural Trade-Offs & Decisions

This document evaluates the three foundational architectural decisions made in the **Webform Builder & Submission Platform**. Each decision highlights the chosen design, considered alternatives, engineering rationale, accepted trade-offs, and conditions where the alternative would be preferable.

---

## Decision 1: PostgreSQL + JSONB vs. MongoDB

### Context
A form builder platform must balance two opposing data modeling paradigms:
1. **Core Relational Structures**: Tenants, User Accounts, Forms, and Form Versions have strict relational boundaries, foreign keys, and require ACID transactions (e.g., publishing a form or rotating a tenant).
2. **Polymorphic Submission Payloads**: User submissions have dynamic schemas determined at runtime by end-users. The structure varies across forms and changes between versions.

### The Decision
We chose **PostgreSQL with native JSONB columns** for the dynamic schema and submission payloads (`FormVersion.schema` and `Submission.data`), while maintaining strict relational tables for `Tenant`, `Form`, `FormVersion`, and `Submission` envelopes.

### Alternative Considered
**MongoDB (or a dedicated Document Database)** storing the entire form definition and submission collection as unstructured BSON documents.

### Why Chosen
* **ACID Transactions & Relational Guarantees**: PostgreSQL provides rock-solid ACID transactions across multi-table operations. For example, publishing a new form version requires updating draft records, incrementing version numbers, and committing timestamps atomically. Relational foreign key constraints guarantee that an orphan submission can never reference a non-existent tenant, form, or form version.
* **Unified Infrastructure**: Choosing PostgreSQL allows the platform to run on a single, battle-tested operational database. Operating both a relational database (for users/billing/tenants) and a separate document database (for submissions) introduces operational overhead, split-brain backup strategies, cross-database consistency issues, and higher infrastructure costs.
* **Efficient Binary JSON (JSONB)**: Unlike plain JSON text storage, PostgreSQL `JSONB` stores data in a parsed binary format with indexed key lookups, support for GIN (Generalized Inverted Index) indexing on arbitrary nested keys, and rich operators (`@>`, `?`, `->`). This allows performant JSON filtering without compromising relational integrity.

### Accepted Trade-Offs
* **No Database-Enforced Schema Inside JSONB**: PostgreSQL does not validate the internal shape or datatypes of JSONB attributes against a SQL DDL schema. We must enforce dynamic schema validation strictly within the application layer (Zod and dynamic schema evaluators) prior to writing to the database.
* **Storage Footprint**: JSONB records repeat dictionary keys for each submission row (e.g., `{"fullName": "...", "email": "..."}`). At multi-million row scale, this consumes more disk space compared to typed relational columns or compressed columnar formats like Parquet.
* **Complex Analytical Queries**: Writing raw SQL aggregations across dynamic JSONB keys (e.g., computing an average across a nested JSON number property) is more verbose and computationally heavier than querying a native SQL column.

### When MongoDB Might Be Better
* **Unstructured or Deeply Nested Graph Documents**: If forms supported arbitrary recursive nesting (e.g., forms within forms, multi-level repeating field grids, dynamic embedded documents with polymorphically divergent structures), MongoDB's native document model offers a more natural fit.
* **Horizontal Auto-Sharding Out of the Box**: If the platform's primary scaling bottleneck was massive write volume distributed across hundreds of shards without needing foreign-key constraints across tenants, MongoDB's native clustering and sharding require less operational configuration than PostgreSQL sharding extensions (such as Citus).

---

## Decision 2: BullMQ/Redis Queue vs. Direct Synchronous Database Writes

### Context
Public webforms are exposed directly to the internet and frequently experience abrupt, volatile spikes in submission traffic. Examples include high-volume marketing email campaigns, time-limited event registrations, or viral social media links.

### The Decision
We introduced an **asynchronous queue architecture** using **Redis and BullMQ** between the public API ingestion endpoint and PostgreSQL. 

The public submission endpoint validates payloads against the published schema, immediately enqueues a durable job to Redis with an idempotent UUID, and returns `HTTP 202 Accepted`. Background BullMQ worker processes pull jobs at a controlled concurrency (`concurrency: 5`) and persist them to PostgreSQL.

### Alternative Considered
**Direct Synchronous Database Writes**: The API route validates the payload and executes `await prisma.submission.create()` directly within the incoming HTTP request handler, returning `HTTP 201 Created` only after PostgreSQL commits to disk.

### Why Chosen
* **Decoupling Throughput from Database Concurrency**: PostgreSQL has a finite connection pool and disk write IOPS. If a burst of 5,000 users submits a form in a 10-second window, direct database writes would spawn 5,000 concurrent transactions, instantly exhausting the connection pool, creating lock contention, and resulting in cascading `HTTP 500` timeouts for end-users. With BullMQ, the API ingests all 5,000 requests into Redis memory in milliseconds, while workers drain the queue at a smooth, sustainable rate that never overwhelms PostgreSQL.
* **Low Client-Perceived Latency**: The client receives an HTTP response as soon as in-memory validation and queue insertion complete (typically under 20ms), rather than waiting on disk I/O, database foreign-key checks, and network latency to a remote database server.
* **Resilience to Downstream Database Outages**: If the PostgreSQL database encounters a temporary network disconnect, maintenance restart, or replica failover, the public API remains 100% operational. Inbound submissions continue buffering safely in Redis. When PostgreSQL recovers, BullMQ workers automatically retry with exponential backoff and resume persistence without dropping a single submission.

### Accepted Trade-Offs
* **Eventual Consistency**: The client receives confirmation that the submission was accepted (`HTTP 202 Accepted`), but the record is not instantly queryable via `GET /api/forms/:id/submissions` until the worker processes it (typically within 50–500ms under normal load).
* **Additional Infrastructure Component**: Introducing Redis introduces a stateful service that requires independent monitoring, connection pooling, memory limits, and persistence configuration (`appendonly yes` / AOF).
* **Complexity in Error Visibility**: If a worker fails to persist a job due to a systemic bug, the failure happens asynchronously after the user has already received an HTTP response. This requires dead-letter queue (DLQ) monitoring and error alerting.

### When Direct Database Writes Might Be Better
* **Low-Volume, Read-Heavy Applications**: For an internal enterprise tool or a platform with predictable, steady traffic (e.g., 2 requests per minute), introducing Redis and BullMQ adds unnecessary operational overhead.
* **Strict Read-Your-Own-Writes Requirements**: If the application workflow requires the user to immediately view or edit their created submission on the subsequent screen with zero latency, synchronous database writes avoid the race condition where a page loads before the worker commits the row.

---

## Decision 3: Immutable Form Versions vs. Modifying the Published Schema

### Context
Form schemas change frequently throughout their lifecycle: creators add new fields, delete outdated questions, rename labels, adjust option choices, and modify validation rules (e.g., turning an optional field into a required one).

### The Decision
We implemented **Immutable Form Versions**. When a form version is marked `PUBLISHED`, its schema is permanently frozen and can never be modified. 

When a user edits a published form, the platform updates or forks an independent `DRAFT` record. When published, this draft becomes a new immutable version (Version 2). Every submission permanently references the exact `formVersionId` that was active at the time of submission.

### Alternative Considered
**Single Mutable Form Schema**: Storing one schema object per form on the `Form` table, directly mutating that schema whenever the author saves edits, and updating or migrating historical submissions to match the new structure.

### Why Chosen
* **Guaranteed Submission Integrity**: A submission only makes sense in the context of the questions asked when the user filled it out. If a question is removed in Version 2, mutating the schema in place either leaves historical submissions referencing an orphaned field with no label, or forces a destructive database migration. By keeping versions immutable, historical submissions permanently link to their original schema and can be faithfully rendered in their historical context.
* **Zero Race Conditions During Concurrent Submissions**: If a form author modifies a schema while hundreds of users have the form open in their browsers, in-place schema mutation causes valid submissions to fail validation midway through their submission flow. With immutable versioning, in-flight submissions simply reference the version they loaded, ensuring seamless continuity.
* **Auditability and Regulatory Compliance**: For legal, compliance, or medical forms, having an unalterable audit log showing the exact wording, disclaimer text, and required inputs at any given timestamp is a mandatory requirement.

### Accepted Trade-Offs
* **Storage and Row Overhead**: The `FormVersion` table grows proportionally with every publish event. Over time, a form published dozens of times accumulates multiple historical schema snapshots in PostgreSQL.
* **Export and Reporting Complexity**: Aggregating submissions across different versions requires application logic to map fields that were renamed across versions (e.g., mapping `phoneNumber` in V1 to `mobilePhone` in V2).
* **More Complex Application State**: Form authoring requires explicit state machines (`DRAFT` vs `PUBLISHED`), version increment logic, and UI handling for published vs. draft states.

### When Modifying Schema in Place Might Be Better
* **Simple Prototypes or Disposable Forms**: For simple survey tools where forms are short-lived, responses are exported once, and authors only fix typos or minor text labels, full immutable versioning introduces unnecessary schema overhead.
* **Schema Evolution with Automatic Backward Compatibility**: If the system exclusively uses a strictly backward-compatible schema registry (such as Protobuf or Avro) where fields are only ever deprecated with default values and never structurally altered.
