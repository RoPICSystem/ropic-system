// app/providers.tsx
"use client";

import { createClient } from "@/utils/supabase/client";
import { getUserProfile } from '@/utils/supabase/server/user';
import { Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Only if using TypeScript
declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

declare global {
  interface Window {
    adminData?: any;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ adminTempData, setAdminTempData ] = useState<any>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data, error } = await getUserProfile();

      if (error) {
        console.error("Error fetching user profile:", error);
        return;
      }

      if (typeof window !== "undefined") {
        setAdminTempData(data);
        window.adminData = data;
      };
    }
    fetchUserProfile();
  }, []);


  // Fetch subscription data
  useEffect(() => {
    if (typeof window === "undefined" || adminTempData === null) {
      return;
    }

    const supabase = createClient()

    // Set up real-time subscription for delivery items
    const profileChannel = supabase
      .channel('delivery-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `uuid=eq.${adminTempData.uuid}`
        },
        async (payload: any) => {
          const { data, error } = await getUserProfile();

          console.log("Profile subscription payload:", payload);

          if (error) {
            console.error("Error fetching profile subscription:", error);
            return;
          }
          if (typeof window !== "undefined") {
            window.adminData = data;
          };

        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Subscribed to profile changes");
        }
      });

    return () => {
      if (profileChannel) {
        profileChannel.unsubscribe();
        console.log("Unsubscribed from profile changes");
      }
    }
  }
  , [adminTempData]);

  if (typeof window === "undefined" || window?.adminData === null || window?.adminData === undefined) {
    return (
      <div className="flex items-center justify-center w-full h-screen">
        <div className="flex flex-col items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  } else {
    return children;
  }

}