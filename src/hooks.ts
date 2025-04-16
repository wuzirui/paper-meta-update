import { PromptExampleFactory } from "./modules/examples";
import { getString, initLocale } from "./utils/locale";
import { getPref, setPref } from "./utils/prefs";
import { createZToolkit } from "./utils/ztoolkit";

async function getSupportedConferences() {
  const response = await fetch(
    "https://wuzirui.github.io/conference-accepted-papers/conf/index.json",
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch conferences: ${response.statusText}`);
  }
  const conferences = await response.json();
  return conferences;
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

function getPrefConferences() {
  const localPrefConfs = getPref("conferences");
  if (!localPrefConfs) {
    setPref("conferences", "[]");
    ztoolkit.getGlobal("alert")(getString("prefs-conferences-not-found"));
    return [];
  }
  try {
    const parsedConfs = JSON.parse(String(localPrefConfs));
    if (
      !Array.isArray(parsedConfs) ||
      !parsedConfs.every((item) => typeof item === "string")
    ) {
      throw new Error("Invalid format");
    }
    return parsedConfs;
  } catch {
    setPref("conferences", "[]");
    return [];
  }
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

  const confs = (await getSupportedConferences()) as unknown as Record<
    string,
    string
  >;
  const localConfs = getPrefConferences();
  ztoolkit.log("Conferences from server:", confs);
  ztoolkit.log("Conferences from local:", localConfs);
  if (Object.keys(confs).length > localConfs.length) {
    ztoolkit.log("Updating conferences...");
    const newConfs = Object.keys(confs).filter(
      (conf) => !localConfs.includes(conf),
    );
    const popupWin1 = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: `New conferences found: ${newConfs.join(", ")}`,
        type: "default",
        progress: 100,
      })
      .show();
    popupWin1.startCloseTimer(5000);
    setPref("conferences", JSON.stringify(Object.keys(confs)));
  }

  PromptExampleFactory.registerNormalCommandExample(confs, processConfMetadata);

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

interface ConferenceMetadata {
  "Conference Name": string;
  "Proceeding Name": string;
  Year: string;
  Publisher: string;
  Papers: { Title: string; Authors: string[] }[];
}

async function fetchConfMetadata(url: string) {
  const papers: { title: string; authors: string[] }[] = [];
  let conferenceMetadata: {
    conferenceName: string;
    proceedingName: string;
    year: string;
    publisher: string;
  } | null = null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = (await response.json()) as unknown as ConferenceMetadata;

    conferenceMetadata = {
      conferenceName: jsonData["Conference Name"] || "Unknown Conference",
      proceedingName: jsonData["Proceeding Name"] || "Unknown Proceedings",
      year: jsonData.Year || "Unknown Year",
      publisher: jsonData.Publisher || "Unknown Publisher",
    };

    const papersData = jsonData.Papers || [];
    papersData.forEach((paper) => {
      const title = paper.Title || "Unknown Title";
      const authors = paper.Authors || [];
      papers.push({ title, authors });
    });
  } catch (error) {
    ztoolkit.getGlobal("alert")(
      `Error fetching conference metadata: ${(error as Error).message}`,
    );
  }

  return { conferenceMetadata, papers };
}

async function debugNotice(msg: string) {
  return;
  ztoolkit.getGlobal("alert")(`Debug Notice: ${msg}`);
}

async function processConfMetadata(confname: string, confurl: string) {
  // Initialize a progress window
  const popupWin = new ztoolkit.ProgressWindow(
    `Updating ${confname} Metadata`,
    {
      closeOnClick: true,
      closeTime: -1,
    },
  )
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
    search.addCondition("title", "beginsWith", title);
    const itemIds = await search.search();

    if (itemIds.length > 0) {
      let id = -1;
      // iterative through all items, find the one with the same title
      for (let j = 0; j < itemIds.length; j++) {
        const item = await Zotero.Items.getAsync(itemIds[j]);
        if (item.getField("title").toLowerCase() === title.toLowerCase()) {
          id = itemIds[j];
          break;
        }
      }
      if (id === -1) {
        continue;
      }
      // Update the metadata
      const item = await Zotero.Items.getAsync(itemIds[0]);

      popupWin.changeLine({
        progress: progress,
        text: `[${progress}%] Updating: ${title}`,
      });

      debugNotice(`Updating ${title} with ${confname} metadata...`);

      await item.setType(11); // Set type to "Conference Paper"

      // Construct author list
      const creators = authors.map((author) => {
        const nameParts = author.trim().split(" ");
        const lastName = nameParts.pop() || "";
        const firstName = nameParts.join(" ");
        return {
          firstName: firstName || "",
          lastName: lastName || "",
          creatorType: "author" as const,
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
    `Found ${found} papers in Zotero library for ${confname}.`,
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
};
