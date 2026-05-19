declare module 'proxy-agent' {
  const ProxyAgent: new (...args: any[]) => any;
  export default ProxyAgent;
  export { ProxyAgent };
}
