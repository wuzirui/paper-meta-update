import {
  PromptExampleFactory,
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


  PromptExampleFactory.registerNormalCommandExample(processConfMetadata);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);

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
  let conferenceMetadata: {
    conferenceName: string;
    proceedingName: string;
    year: string;
    publisher: string;
  } | null = null;

  try {
    // Fetch the JSON content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();

    // Extract conference metadata
    conferenceMetadata = {
      conferenceName: jsonData["Conference Name"] || "Unknown Conference",
      proceedingName: jsonData["Proceeding Name"] || "Unknown Proceedings",
      year: jsonData["Year"] || "Unknown Year",
      publisher: jsonData["Publisher"] || "Unknown Publisher",
    };

    // Extract papers
    const papersData = jsonData["Papers"] || [];
    papersData.forEach((paper: { Title: string; Authors: string[] }) => {
      const title = paper.Title || "Unknown Title";
      const authors = paper.Authors || [];
      papers.push({ title, authors });
    });
  } catch (error) {
    ztoolkit.getGlobal("alert")(
      `Error fetching conference metadata: ${error.message}`
    );
  }

  return { conferenceMetadata, papers };
}

async function debugNotice(msg) {
  return;
  ztoolkit.getGlobal("alert")(
    `Debug Notice: ${msg}`
  );
}


async function processConfMetadata(confname: string, confurl: string) {
  // Initialize a progress window
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

  // Fetch conference metadata and papers
  const { conferenceMetadata, papers } = await fetchConfMetadata(confurl);

  if (!conferenceMetadata) {
    popupWin.changeLine({
      progress: 100,
      text: `Failed to fetch metadata for ${confname}.`,
    });
    popupWin.startCloseTimer(5000);
    return;
  }

  const { proceedingName, conferenceName, publisher } = conferenceMetadata;
  const numPapers = papers.length;

  popupWin.changeLine({
    progress: 0.1,
    text: `Fetched ${numPapers} papers from ${confname}.`,
  });

  // Process each paper
  let found = 0;
  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const title = paper.title;
    const authors = paper.authors;
    const progress = Math.round(((i + 1) / numPapers) * 100);

    // Search for the paper in Zotero library
    const search = new Zotero.Search();
    search.addCondition("title", "is", title);
    const itemIds = await search.search();

    if (itemIds.length > 0) {
      popupWin.changeLine({
        progress: progress,
        text: `[${progress}%] Updating: ${title}`,
      });

      debugNotice(`Updating ${title} with ${confname} metadata...`);

      // Update the metadata
      const item = await Zotero.Items.getAsync(itemIds[0]);
      await item.setType(11); // Set type to "Conference Paper"

      // Construct author list
      const creators = authors.map((author) => {
        const [firstName, lastName] = author.split(" ");
        return {
          firstName: firstName || "",
          lastName: lastName || "",
          creatorType: "author",
        };
      });
      await item.setCreators(creators);

      // Set metadata fields
      await item.setField("proceedingsTitle", proceedingName);
      await item.setField("conferenceName", conferenceName);
      await item.setField("publisher", publisher);
      await item.setField("DOI", "");
      await item.setField("extra", "");
      await item.setField("accessDate", "");
      await item.setField("libraryCatalog", "");

      // Add a tag for the conference
      await item.addTag(confname, 1);

      // Save the updated item
      await item.saveTx();
      debugNotice(`Saved item: ${title}`);
      found++;
    }
  }

  popupWin.changeLine({
    progress: 100,
    text: `Processed ${numPapers} papers. Found ${found} in Zotero library.`,
  });
  popupWin.startCloseTimer(5000);

  ztoolkit.getGlobal("alert")(
    `Found ${found} papers in Zotero library for ${confname}.`
  );
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
};
