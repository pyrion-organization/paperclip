function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const baseClassName = "bg-accent/75 rounded-md";

  return (
    <div
      data-slot="skeleton"
      className={className ? `${baseClassName} ${className}` : baseClassName}
      {...props}
    />
  )
}

export { Skeleton }
