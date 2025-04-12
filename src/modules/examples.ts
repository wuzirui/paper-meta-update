// function getConfWebsites(ConfName: string) {
//   const webs = {
//     "CVPR'25": ["https://wuzirui.github.io/conference-accepted-papers/conf/CVPR/2025.json"],
//     "CVPR'24": ["https://wuzirui.github.io/conference-accepted-papers/conf/CVPR/2024.json"],
//     "CVPR'23": ["https://wuzirui.github.io/conference-accepted-papers/conf/CVPR/2023.json"],
//     "CVPR'22": ["https://openaccess.thecvf.com/CVPR2022?day=all"],
//     "CVPR'21": ["https://openaccess.thecvf.com/CVPR2021?day=all"],
//     "CVPR'20": [
//       "https://openaccess.thecvf.com/CVPR2020?day=2020-06-16",
//       "https://openaccess.thecvf.com/CVPR2020?day=2020-06-17",
//       "https://openaccess.thecvf.com/CVPR2020?day=2020-06-18"
//     ],
//     "CVPR'19": [
//       "https://openaccess.thecvf.com/CVPR2019?day=2019-06-18",
//       "https://openaccess.thecvf.com/CVPR2019?day=2019-06-19",
//       "https://openaccess.thecvf.com/CVPR2019?day=2019-06-20"
//     ],
//     "CVPR'18": [
//       "https://openaccess.thecvf.com/CVPR2018?day=2018-06-19",
//       "https://openaccess.thecvf.com/CVPR2018?day=2018-06-20",
//       "https://openaccess.thecvf.com/CVPR2018?day=2018-06-21"
//     ],
//     "CVPR'17": ["https://openaccess.thecvf.com/CVPR2017"],
//     "CVPR'16": ["https://openaccess.thecvf.com/CVPR2016"],
//     "CVPR'15": ["https://openaccess.thecvf.com/CVPR2015"],
//     "CVPR'14": ["https://openaccess.thecvf.com/CVPR2014"],
//     "CVPR'13": ["https://openaccess.thecvf.com/CVPR2013"],
//   }
//   return webs[ConfName];
// }

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
  static registerNormalCommandExample(
    conferences: Record<string, string>,
    hooks: any,
  ) {
    const entries = Object.entries(conferences).map(([conf, website]) => ({
      name: `Process All ${conf} Papers`,
      label: "Paper Metadata Update",
      callback: async () => {
        if (website) {
          await hooks(conf, website);
        } else {
          ztoolkit.getGlobal("alert")(`No website found for ${conf}`);
        }
      },
    }));

    ztoolkit.Prompt.register(entries);
  }
}
