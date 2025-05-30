// app/providers.tsx
"use client";

import SplashScreen from "@/components/splashscreen";
import { createClient } from "@/utils/supabase/client";
import { getUserFromCookies, getUserProfile, setUserInCookies } from '@/utils/supabase/server/user';
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
    userData?: any;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data, error } = await getUserProfile();

      if (error) {
        console.error("Error fetching user profile:", error);
        return;
      }

      setUserInCookies(data);
      setUser(data);
    }
    fetchUserProfile();
  }, []);


  // Fetch subscription data
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      const userData = await getUserFromCookies();
      if (userData === null) {
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
            filter: `uuid=eq.${userData.uuid}`
          },
          async (payload: any) => {
            const { data, error } = await getUserProfile();

            if (error) {
              console.error("Error fetching profile subscription:", error);
              return;
            }
            setUserInCookies(data);
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
    };

    fetchSubscriptionData();
  }, []);



  return (
    <SplashScreen isLoading={user === null}>
      {children}
    </SplashScreen>

  );


}