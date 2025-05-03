import React from "react"

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-full space-y-4">
      {children}
    </div>
  )
}