import { Text } from "@mariozechner/pi-tui";

export function conciseResult(title: string, detail?: string) {
  return new Text(detail ? `${title} ${detail}` : title, 0, 0);
}

export function shorten(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
