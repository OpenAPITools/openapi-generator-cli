declare module 'proxy-agent' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ProxyAgent: new (...args: any[]) => any;
  export default ProxyAgent;
  export { ProxyAgent };
}
