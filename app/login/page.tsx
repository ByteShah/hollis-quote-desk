import type { Metadata } from "next";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "no-company": "Your account isn't part of an active company. Ask your company's owner for an invitation.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={next ?? null} notice={(error && NOTICES[error]) || null} />;
}
