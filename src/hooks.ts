import {
  BasicExampleFactory,
  PromptExampleFactory,
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

  // await Zotero.Promise.delay(1000);
  // popupWin.changeLine({
  //   progress: 30,
  //   text: `[30%] ${getString("startup-begin")}`,
  // });

  UIExampleFactory.registerStyleSheet(win);

  UIExampleFactory.registerRightClickMenuItem();

  UIExampleFactory.registerRightClickMenuPopup(win);

  UIExampleFactory.registerWindowMenuWithSeparator();

  PromptExampleFactory.registerNormalCommandExample(processConfMetadata);

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


async function fetchConfMetadata(url: string) {
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
      // Find the title in <strong> or <a>
      const titleTag = row.querySelector("strong") || row.querySelector("a");
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
    ztoolkit.getGlobal("alert")(
      `Error fetching conference metadata: ${error.message}`
    );
  }
  return papers;
}

async function debugNotice(msg) {
  return;
  ztoolkit.getGlobal("alert")(
    `Debug Notice: ${msg}`
  );
}


async function processConfMetadata(confname: string, confurl: string, confproceedings: string, conffullname: string, confpublisher: string) {

  // initialize a progress window
  const popupWin = new ztoolkit.ProgressWindow(`Updating ${confname} Metadata`, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: `Fetching ${confname} metadata...`,
      type: "default",
      progress: 0,
    })
    .show();

  const papers = await fetchConfMetadata(confurl);
  const numPapers = papers.length;
  popupWin.changeLine({
    progress: 0.1,
    text: `Fetched ${numPapers} papers from ${confname}.`,
  });

  // process every paper
  let found = 0;
  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const title = paper.title;
    const authors = paper.authors;
    const progress = Math.round(((i + 1) / numPapers) * 100);
    
    // find if the item exist in zotero library
    const search = new Zotero.Search();
    search.addCondition("title", "is", title);
    const itemIds = await search.search();
    if (itemIds.length > 0) {
      popupWin.changeLine({
        progress: progress,
        text: `[${progress}%] ${title} by ${authors}`,
      });

      debugNotice(
        `Updating ${title} by ${authors} with ${confname} metadata...`
      );
      // update the metadata
      const item = await Zotero.Items.getAsync(itemIds[0]);
      debugNotice(`Found item: ${item}`);
      await item.setType(11); // Set type to "Conference Paper"
      debugNotice(`Set type to Conference Paper`);

      // construct author list
      const creators = authors.map((author) => {
        const [firstName, lastName] = author.split(" ");
        return {
          firstName: firstName || "",
          lastName: lastName || "",
          creatorType: "author",
        };
      });
      await item.setCreators(creators);
      debugNotice(`Set authors: ${creators}`);
      await item.setField("proceedingsTitle", confproceedings);
      await item.setField("conferenceName", conffullname);
      await item.setField("publisher", confpublisher);
      await item.setField("DOI", "");
      await item.setField("extra", "");
      await item.setField("accessDate", "");
      await item.setField("libraryCatalog", "");
      await item.setField("extra", "");
      debugNotice(`Set metadata: ${confproceedings}, ${conffullname}, ${confpublisher}`);
      await item.addTag(confname, 1);
      await item.saveTx();
      debugNotice(`Saved item: ${item}`);
      found++;
    }
  }
  ztoolkit.getGlobal("alert")(
    `Found ${found} papers in Zotero library that is ${confname} paper.`
  );
}

function onDialogEvents(type: string) {
  switch (type) {
    case "CVPR2025":
      processConfMetadata();
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
