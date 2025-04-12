import {
  BasicExampleFactory,
  UIExampleFactory
} from "./modules/examples";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // BasicExampleFactory.registerPrefs();

  // BasicExampleFactory.registerNotifier();

  // KeyExampleFactory.registerShortcuts();

  // await UIExampleFactory.registerExtraColumn();

  // await UIExampleFactory.registerExtraColumnWithCustomCell();

  // UIExampleFactory.registerItemPaneCustomInfoRow();

  // UIExampleFactory.registerItemPaneSection();

  // UIExampleFactory.registerReaderItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  // @ts-ignore This is a moz feature
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  await Zotero.Promise.delay(1000);
  popupWin.changeLine({
    progress: 30,
    text: `[30%] ${getString("startup-begin")}`,
  });

  UIExampleFactory.registerStyleSheet(win);

  UIExampleFactory.registerRightClickMenuItem();

  UIExampleFactory.registerRightClickMenuPopup(win);

  UIExampleFactory.registerWindowMenuWithSeparator();

  // PromptExampleFactory.registerNormalCommandExample();

  // PromptExampleFactory.registerAnonymousCommandExample(win);

  // PromptExampleFactory.registerConditionalCommandExample();

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);

  addon.hooks.onDialogEvents("dialogExample");
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
  if (
    event == "select" &&
    type == "tab" &&
    extraData[ids[0]].type == "reader"
  ) {
    BasicExampleFactory.exampleNotifierCallback();
  } else {
    return;
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

// function onShortcuts(type: string) {
//   switch (type) {
//     case "larger":
//       KeyExampleFactory.exampleShortcutLargerCallback();
//       break;
//     case "smaller":
//       KeyExampleFactory.exampleShortcutSmallerCallback();
//       break;
//     default:
//       break;
//   }
// }

async function fetchCVPR2025Metadata(url: string) {
  const papers: { title: string; authors: string[] }[] = [];
  try {
    // Fetch the webpage content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const htmlContent = await response.text();

    // Parse the HTML content using DOMParser
    const parser = new DOMParser();
    const document = parser.parseFromString(htmlContent, "text/html");

    // Extract paper titles and authors
    const rows = document.querySelectorAll("tr"); // Iterate over table rows
    rows.forEach((row) => {
      const titleTag = row.querySelector("strong"); // Find the title in <strong>
      const authorsTag = row.querySelector("div.indented"); // Find authors in <div class="indented">

      if (titleTag && authorsTag) {
        const title = titleTag.textContent?.trim() || "Unknown Title";
        const authors = authorsTag.textContent
          ?.split("·")
          .map((author) => author.trim()) || [];
        papers.push({ title, authors });
      }
    });
  } catch (error) {
    console.error("Error fetching CVPR 2025 metadata:", error);
  }
  return papers;
}



async function processCVPR2025Metadata() {
  ztoolkit.getGlobal("alert")("Fetching CVPR 2025 metadata...");
  const url = "https://cvpr.thecvf.com/Conferences/2025/AcceptedPapers";
  const papers = await fetchCVPR2025Metadata(url);
  const numPapers = papers.length;
  ztoolkit.getGlobal("alert")(`Fetched ${numPapers} papers from CVPR 2025.`);

  // initialize a progress window
  const popupWin = new ztoolkit.ProgressWindow("Updating CVPR'25 Metadata", {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("cvpr-progress-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  // process every paper
  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const title = paper.title;
    const authors = paper.authors.join(", ");
    const progress = Math.round(((i + 1) / numPapers) * 100);
    popupWin.changeLine({
      progress: progress,
      text: `[${progress}%] ${title} by ${authors}`,
    });
    await Zotero.Promise.delay(100); // Simulate processing delay
  }
  
}

function onDialogEvents(type: string) {
  switch (type) {
    case "CVPR2025":
      processCVPR2025Metadata();
      break;
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  // onShortcuts,
  onDialogEvents,
};
