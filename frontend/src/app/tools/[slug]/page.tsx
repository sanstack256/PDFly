import { notFound } from "next/navigation";
import { TOOLS } from "@/lib/tools";
import ToolRunner from "@/components/ToolRunner";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return TOOLS.map((tool) => ({
    slug: tool.id,
  }));
}

export default async function ToolPage({ params }: PageProps) {
  const { slug } = await params;
  const tool = TOOLS.find((t) => t.id === slug);

  if (!tool) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50/50 py-8">
      <ToolRunner tool={tool} />
    </main>
  );
}
