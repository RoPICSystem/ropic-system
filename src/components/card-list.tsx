import {
  Card,
  CardBody,
  CardHeader,
  Divider
} from "@heroui/react";
import React from "react";

export default function CardList({ children, className = 'bg-background p-4' } : { children: React.ReactNode; className?: string }) {
  const childrenArray = React.Children.toArray(children);

  return (
    <div>
      <div className="space-y-[0.1rem] p-0">
        {childrenArray.map((child, index) => (
          <div className={`shadow-xl shadow-primary/10 min-h-20
            ${index === 0 ? 'rounded-t-2xl' : 'rounded-t-md'} 
            ${index === childrenArray.length - 1 ? 'rounded-b-2xl' : 'rounded-b-md'}
            !border !border-default-200
            ${className}
            `}
            key={index}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}