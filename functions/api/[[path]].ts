import { handleApi, type Env } from "../../src/server/api";
export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  handleApi(request, env);
