export function doSomething(input: string): string {
    if (!input) throw new Error('Input required');
    return `Processed: ${input}`;
}