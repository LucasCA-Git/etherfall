declare module '*.webp' {
  const url: string;
  export default url;
}

interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean; query?: string; import?: string }): Record<string, T>;
}
