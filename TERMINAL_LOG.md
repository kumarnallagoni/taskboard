]633;E;echo '### TASK COMMENTS TARGETED CHECKS';aa874a7b-b19f-4a75-8c17-00dc58ba549d]633;C### TASK COMMENTS TARGETED CHECKS

$ docker-compose exec -T web npm test -- --run src/tests/auth.test.ts src/tests/TaskDetailComments.test.tsx

> taskboard@0.1.0 test
> vitest run --run src/tests/auth.test.ts src/tests/TaskDetailComments.test.tsx

[33mThe CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.[39m

 RUN  v2.1.8 /app

 ✓ src/tests/auth.test.ts (6 tests) 34ms
 ✓ src/tests/TaskDetailComments.test.tsx (4 tests) 604ms
   ✓ TaskDetail comments > posts a comment and refreshes the thread 302ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  10:07:18
   Duration  4.07s (transform 712ms, setup 734ms, collect 878ms, tests 638ms, environment 1.34s, prepare 2.34s)


---
$ docker-compose exec -T web npm run typecheck

> taskboard@0.1.0 typecheck
> tsc --noEmit


---
$ docker-compose exec -T db psql -U taskboard -d taskboard -c "SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'task_comments_append_only';"
          tgname           | tgenabled |                                                                   pg_get_triggerdef                                                                    
---------------------------+-----------+--------------------------------------------------------------------------------------------------------------------------------------------------------
 task_comments_append_only | O         | CREATE TRIGGER task_comments_append_only BEFORE DELETE OR UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION prevent_task_comment_mutation()
(1 row)

