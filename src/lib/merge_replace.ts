import { JSONValue } from '@/interfaces/json';

/**
 * Info: (20251118 - Luphia) 安全地從物件中解析點記法 (dot-notation) 路徑 (pathString) 的值
 * @param {object} data - 要查詢的來源物件
 * @param {string} pathString - 點記法的路徑字串 (例如 "user.name")
 * @returns {*} - 根據路徑找到的值，可能是 undefined
 */
const resolvePath = (data: JSONValue, pathString: string): JSONValue | undefined => {
  try {
    const path = pathString.split('.');
    return path.reduce((current: unknown, key: string) => {
      // Info: (20251118 - Luphia) 如果當前值是 null 或 undefined，無法繼續深入，回傳 undefined
      if (current === null || current === undefined) {
        return undefined;
      }
      return (current as Record<string, JSONValue>)[key];
    }, data);
  } catch (error) {
    // Info: (20251118 - Luphia) 如果路徑無效或中途出錯，回傳 undefined
    (error as Error).message += ` (while resolving path: ${pathString})`;
    return undefined;
  }
}

/**
 * Info: (20251118 - Luphia) 遍歷樣板 (value) 並用資料 (data) 進行替換
 * @param {*} value - 來自 template 樣板的當前值 (可能是物件、陣列、字串等)
 * @param {object} data - 完整的 data 資料物件
 * @returns {*} - 替換後的值
 */
const traverseAndReplace = (value: JSONValue, data: JSONValue): JSONValue => {
  // Info: (20251118 - Luphia) 如果值是陣列 (Array)，遞迴處理陣列中的每一個元素
  if (Array.isArray(value)) {
    return value.map(item => traverseAndReplace(item, data));
  }

  // Info: (20251118 - Luphia) 如果值是物件 (Object)，遞迴處理物件中的每一個值
  if (typeof value === 'object' && value !== null) {
    const newObj: JSONValue = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        newObj[key] = traverseAndReplace(value[key], data);
      }
    }
    return newObj;
  }

  // Info: (20251118 - Luphia) 如果值是字串 (String)，執行核心的替換邏輯
  if (typeof value === 'string') {

    // Info: (20251118 - Luphia) 完全符合 ${data.key...} 格式
    const directMatchRegex = /^\$\{data\.(.*?)\}$/;
    const directMatch = value.match(directMatchRegex);

    if (directMatch) {
      const path = directMatch[1];
      return resolvePath(data, path) ?? value;
    }

    // Info: (20251118 - Luphia) 字串中「包含」 ${data.key...} 格式
    const embeddedRegex = /\$\{data\.(.*?)\}/g;

    // Info: (20251118 - Luphia) 先測試是否存在，避免不必要的 .replace 執行
    if (embeddedRegex.test(value)) {
      // Info: (20251118 - Luphia) 使用 .replace 搭配 replacer 函式來處理所有匹配項
      return value.replace(embeddedRegex, (match, path) => {
        const replacementValue = resolvePath(data, path);

        // Info: (20251118 - Luphia) 如果在 data 中找不到對應的值則保持不變
        if (replacementValue === undefined) {
          return value;
        }

        // Info: (20251118 - Luphia) 依照規則，使用 JSON.stringify() 將取得的值轉換為字串
        return JSON.stringify(replacementValue);
      });
    }

    // Info: (20251118 - Luphia) 如果字串中沒有任何匹配項，原樣回傳
    return value;
  }

  // Info: (20251118 - Luphia) 如果值是其他類型 (Number, Boolean, null)，原樣回傳
  return value;
}

/**
 * Info: (20251118 - Luphia)
 * 輸入兩個 JSON (物件)，第一個 JSON 為樣板物件，第二個 JSON 為 資料物件。
 * 樣板物件的內容如 ${data.key1.key2} 在函式內會被替換成 data.key1.key2。
 * 若包在字串內如 template.content[1].text = 'some text here ${data.key3.key4}' 
 * 則會替會為 `some text here ${JSON.stringify(data.key3.key4)}`。
 *
 * @param {object} template - 樣板物件
 * @param {object} data - 資料物件
 * @returns {object} - 處理過後的新物件。
 */
const mergeReplace = (template: JSONValue, data: JSONValue) => {
  const result = traverseAndReplace(template, data);
  return result;
}

export { mergeReplace };
