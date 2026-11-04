export function withClassName(base: string, className?: string): string {
  return className ? base + ' ' + className : base;
}
