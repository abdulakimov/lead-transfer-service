import { redirect } from "next/navigation";

export default async function IntegrationEditorRedirect({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}) {
  const { integrationId } = await params;
  redirect(`/integrations?edit=${encodeURIComponent(integrationId)}`);
}
