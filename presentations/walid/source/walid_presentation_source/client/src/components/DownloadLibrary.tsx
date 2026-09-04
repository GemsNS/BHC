/** Architect's Sample Room: compact transmittal library for every source and output. */
import { ArrowUpRight, Download, FileArchive } from "lucide-react"
import { downloads } from "@/data/project"

export default function DownloadLibrary() {
  const groups = ["Design Options", "Contract", "Plans", "Takeoff", "Model"]

  return (
    <div className="download-library">
      {groups.map((group) => (
        <section key={group}>
          <div className="download-library__heading"><FileArchive size={18} /><h3>{group}</h3></div>
          {downloads.filter((item) => item.group === group).map((item) => (
            <a key={item.label} href={item.href} download>
              <span><b>{item.label}</b><small>{item.format}</small></span>
              {item.format === "PDF" ? <ArrowUpRight size={17} /> : <Download size={17} />}
            </a>
          ))}
        </section>
      ))}
    </div>
  )
}
