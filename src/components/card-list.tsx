import {
  Card,
  CardBody,
  CardHeader,
  Divider
} from "@heroui/react";
import React from "react";

export default function CardList({ children, className = 'bg-background p-4', innerClass = "space-y-[0.1rem] p-0", style }: { children: React.ReactNode; className?: string, innerClass?: string, style?: React.CSSProperties }) {
  const childrenArray = React.Children.toArray(children);

  return (
    <div className={innerClass} style={style}>
      {childrenArray.map((child, index) => {
        const classNameProps = React.isValidElement<{ className?: string }>(child)
          ? child.props.className ?? ''
          : '';

        return <div className={
          `shadow-xl shadow-primary/10 min-h-20
            ${index === 0 ? 'rounded-t-2xl' : 'rounded-t-md'} 
            ${index === childrenArray.length - 1 ? 'rounded-b-2xl' : 'rounded-b-md'}
            !border !border-default-200 transition-all 
            ${className}
            ${classNameProps}
            `}
          key={index}>
          {child}
        </div>
      })}
    </div>
  );
}