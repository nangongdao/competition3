/**
 * 生成带 charset 的 data URL，用于在浏览器端就地构造下载内容。
 *
 * 纯函数，便于单测。
 */
export function buildDownloadDataUrl(contentType: string, content: string): string {
  return `data:${contentType};charset=utf-8,${encodeURIComponent(content)}`;
}

/**
 * 以指定内容类型和文件名触发一次浏览器文本下载。
 */
export function downloadTextFile(
  content: string,
  contentType: string,
  filename: string,
): void {
  const objectUrl = URL.createObjectURL(
    new Blob([content], { type: `${contentType};charset=utf-8` }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
