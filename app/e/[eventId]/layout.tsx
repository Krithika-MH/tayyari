"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell, InvalidTokenScreen } from "@/components/shell/AppShell";
import { EventProvider } from "@/components/shell/EventContext";
import { Skeleton, ToastProvider } from "@/components/ui/primitives";

function EventLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ eventId: string }>();
  const searchParams = useSearchParams();

  const eventId = params?.eventId ?? "";
  const token = searchParams.get("t") ?? "";

  if (!eventId || !token) {
    return <InvalidTokenScreen />;
  }

  return (
    <ToastProvider>
      <EventProvider eventId={eventId} token={token}>
        <AppShell>{children}</AppShell>
      </EventProvider>
    </ToastProvider>
  );
}

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-bg p-6">
          <div className="mx-auto max-w-[1120px] space-y-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      }
    >
      <EventLayoutInner>{children}</EventLayoutInner>
    </React.Suspense>
  );
}
