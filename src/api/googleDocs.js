import { findTabByTitle } from "../lib/docParser.js";

/**
 * Fetches a Google Doc (with all tabs) and returns the tab whose title
 * matches `tabTitle`. Returns undefined when the tab is missing or the request
 * failed, so the caller can skip the document and carry on; the reason is
 * logged. Callers decide how (and in which language) to report the skip.
 */
export async function getTabContent(docId, accessToken, tabTitle) {
  const url = `https://docs.googleapis.com/v1/documents/${docId}?includeTabsContent=true`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const targetTab = findTabByTitle(data.tabs, tabTitle);
    if (!targetTab || !targetTab.documentTab) {
      throw new Error(`Tab with title ${tabTitle} not found in this document.`);
    }

    return targetTab;
  } catch (error) {
    console.error("Error fetching document:", error);
  }
}

/**
 * Returns a Google Doc's title (the file name shown in Drive), or "" when the
 * document has none. `?fields=title` keeps the response tiny — unlike
 * getTabContent, none of the body is needed. No `x-goog-user-project`
 * header (see batchUpdateDoc below).
 * Throws on a failed request so the caller can decide how to recover.
 */
export async function getDocTitle(docId, accessToken) {
  const url = `https://docs.googleapis.com/v1/documents/${docId}?fields=title`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.title || "";
}

/**
 * Sends a batchUpdate to a Google Doc. No `x-goog-user-project` header: a
 * teacher token comes from the app's own OAuth client, so Google already bills
 * it to that project, and naming the project only adds a check that the
 * teacher holds roles/serviceusage.serviceUsageConsumer on it. The
 * service-account token 403s with the header outright. Keep in sync with the
 * backend's lib/googleDocsApi.js.
 */
export async function batchUpdateDoc(docId, requests, accessToken) {
  const updateHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: updateHeaders,
      body: JSON.stringify({ requests }),
    },
  );

  if (!updateResponse.ok) {
    const err = await updateResponse.json();
    console.error("Detail:", err);
    throw new Error("Lỗi cập nhật Google Doc");
  }
  return updateResponse;
}
