export default async function HostPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <h1>{handle}</h1>;
}
