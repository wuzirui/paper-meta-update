
function example(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) {
  const original = descriptor.value;
  descriptor.value = function (...args: any) {
    try {
      ztoolkit.log(`Calling example ${target.name}.${String(propertyKey)}`);
      return original.apply(this, args);
    } catch (e) {
      ztoolkit.log(`Error in example ${target.name}.${String(propertyKey)}`, e);
      throw e;
    }
  };
  return descriptor;
}

export class PromptExampleFactory {
  @example
  static registerNormalCommandExample() {
    ztoolkit.Prompt.register([
      {
        name: "Find All CVPR 2025 Papers",
        label: "Paper Meta Update",
        async callback(prompt) { // 将 callback 声明为 async
            var s = new Zotero.Search();
            s.libraryID = Zotero.Libraries.userLibraryID;
            const itemIDs = await s.search();
            const items = await Zotero.Items.getAsync(itemIDs);
            const titles = items.slice(0, 10).map(item => item.getField('title')).join(", ");
            ztoolkit.getGlobal("alert")(`Titles: ${titles}`);
        },
      },
    ]);
  }

  @example
  static registerAnonymousCommandExample(window: Window) {
    ztoolkit.Prompt.register([
      {
        id: "search",
        callback: async (prompt) => {
          // https://github.com/zotero/zotero/blob/7262465109c21919b56a7ab214f7c7a8e1e63909/chrome/content/zotero/integration/quickFormat.js#L589
          function getItemDescription(item: Zotero.Item) {
            const nodes = [];
            let str = "";
            let author,
              authorDate = "";
            if (item.firstCreator) {
              author = authorDate = item.firstCreator;
            }
            let date = item.getField("date", true, true) as string;
            if (date && (date = date.substr(0, 4)) !== "0000") {
              authorDate += " (" + parseInt(date) + ")";
            }
            authorDate = authorDate.trim();
            if (authorDate) nodes.push(authorDate);

            const publicationTitle = item.getField(
              "publicationTitle",
              false,
              true,
            );
            if (publicationTitle) {
              nodes.push(`<i>${publicationTitle}</i>`);
            }
            let volumeIssue = item.getField("volume");
            const issue = item.getField("issue");
            if (issue) volumeIssue += "(" + issue + ")";
            if (volumeIssue) nodes.push(volumeIssue);

            const publisherPlace = [];
            let field;
            if ((field = item.getField("publisher")))
              publisherPlace.push(field);
            if ((field = item.getField("place"))) publisherPlace.push(field);
            if (publisherPlace.length) nodes.push(publisherPlace.join(": "));

            const pages = item.getField("pages");
            if (pages) nodes.push(pages);

            if (!nodes.length) {
              const url = item.getField("url");
              if (url) nodes.push(url);
            }

            // compile everything together
            for (let i = 0, n = nodes.length; i < n; i++) {
              const node = nodes[i];

              if (i != 0) str += ", ";

              if (typeof node === "object") {
                const label =
                  Zotero.getMainWindow().document.createElement("label");
                label.setAttribute("value", str);
                label.setAttribute("crop", "end");
                str = "";
              } else {
                str += node;
              }
            }
            if (str.length) str += ".";
            return str;
          }
          function filter(ids: number[]) {
            ids = ids.filter(async (id) => {
              const item = (await Zotero.Items.getAsync(id)) as Zotero.Item;
              return item.isRegularItem() && !(item as any).isFeedItem;
            });
            return ids;
          }
          const text = prompt.inputNode.value;
          prompt.showTip("Searching...");
          const s = new Zotero.Search();
          s.addCondition("quicksearch-titleCreatorYear", "contains", text);
          s.addCondition("itemType", "isNot", "attachment");
          let ids = await s.search();
          // prompt.exit will remove current container element.
          // @ts-ignore ignore
          prompt.exit();
          const container = prompt.createCommandsContainer();
          container.classList.add("suggestions");
          ids = filter(ids);
          console.log(ids.length);
          if (ids.length == 0) {
            const s = new Zotero.Search();
            const operators = [
              "is",
              "isNot",
              "true",
              "false",
              "isInTheLast",
              "isBefore",
              "isAfter",
              "contains",
              "doesNotContain",
              "beginsWith",
            ];
            let hasValidCondition = false;
            let joinMode = "all";
            if (/\s*\|\|\s*/.test(text)) {
              joinMode = "any";
            }
            text.split(/\s*(&&|\|\|)\s*/g).forEach((conditinString: string) => {
              const conditions = conditinString.split(/\s+/g);
              if (
                conditions.length == 3 &&
                operators.indexOf(conditions[1]) != -1
              ) {
                hasValidCondition = true;
                s.addCondition(
                  "joinMode",
                  joinMode as _ZoteroTypes.Search.Operator,
                  "",
                );
                s.addCondition(
                  conditions[0] as string,
                  conditions[1] as _ZoteroTypes.Search.Operator,
                  conditions[2] as string,
                );
              }
            });
            if (hasValidCondition) {
              ids = await s.search();
            }
          }
          ids = filter(ids);
          console.log(ids.length);
          if (ids.length > 0) {
            ids.forEach((id: number) => {
              const item = Zotero.Items.get(id);
              const title = item.getField("title");
              const ele = ztoolkit.UI.createElement(window.document!, "div", {
                namespace: "html",
                classList: ["command"],
                listeners: [
                  {
                    type: "mousemove",
                    listener: function () {
                      // @ts-ignore ignore
                      prompt.selectItem(this);
                    },
                  },
                  {
                    type: "click",
                    listener: () => {
                      prompt.promptNode.style.display = "none";
                      ztoolkit.getGlobal("Zotero_Tabs").select("zotero-pane");
                      ztoolkit.getGlobal("ZoteroPane").selectItem(item.id);
                    },
                  },
                ],
                styles: {
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "start",
                },
                children: [
                  {
                    tag: "span",
                    styles: {
                      fontWeight: "bold",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                    properties: {
                      innerText: title,
                    },
                  },
                  {
                    tag: "span",
                    styles: {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                    properties: {
                      innerHTML: getItemDescription(item),
                    },
                  },
                ],
              });
              container.appendChild(ele);
            });
          } else {
            // @ts-ignore ignore
            prompt.exit();
            prompt.showTip("Not Found.");
          }
        },
      },
    ]);
  }

  @example
  static registerConditionalCommandExample() {
    ztoolkit.Prompt.register([
      {
        name: "Conditional Command Test",
        label: "Plugin Template",
        // The when function is executed when Prompt UI is woken up by `Shift + P`, and this command does not display when false is returned.
        when: () => {
          const items = ztoolkit.getGlobal("ZoteroPane").getSelectedItems();
          return items.length > 0;
        },
        callback(prompt) {
          prompt.inputNode.placeholder = "Hello World!";
          const items = ztoolkit.getGlobal("ZoteroPane").getSelectedItems();
          ztoolkit.getGlobal("alert")(
            `You select ${items.length} items!\n\n${items
              .map(
                (item, index) =>
                  String(index + 1) + ". " + item.getDisplayTitle(),
              )
              .join("\n")}`,
          );
        },
      },
    ]);
  }
}
