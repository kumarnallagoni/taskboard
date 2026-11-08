CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_comments_task_id_created_at_idx"
    ON "task_comments" ("task_id", "created_at");

ALTER TABLE "task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_comments"
    ADD CONSTRAINT "task_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_task_comment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'task comments are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_comments_append_only
BEFORE UPDATE OR DELETE ON "task_comments"
FOR EACH ROW
EXECUTE FUNCTION prevent_task_comment_mutation();
