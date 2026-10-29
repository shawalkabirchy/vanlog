export const onRequestGet: PagesFunction = ({ request, params, next }) => {
  const id = String(params.id);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return next();
  const target = new URL("/equipment/view/", request.url);
  target.searchParams.set("id", id);
  return Response.redirect(target.toString(), 302);
};
