export class CodeGenerator {
  static generate(prefix: string, maxCode: string | null): string {
    if (!maxCode) {
      return `${prefix}001`;
    }
    const numStr = maxCode.replace(prefix, '');
    const next = parseInt(numStr, 10) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  }
}
