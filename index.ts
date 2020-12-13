import { exec } from "child_process"
import { inspect } from "util"

interface Device {
    type: string,
    name: string,
    id: number,
    attached: Device[],
    master: boolean,
    floating: boolean,
}

interface XInputs {
    pairs: Device[][],
    floating: Device[]
}


const regex_xinput = /[⎡⎣⎜]? +(?<name>.+) *\tid=(?<id>\d+)\t+\[(?<master>(master|slave)) +(?<type>keyboard|pointer) +\(\d+\)\]/ig
export async function xinput(): Promise<XInputs> {
    var res: string = await new Promise((r, e) => {
        exec("xinput list --short", (error, stdout, stderr) => {
            if (stderr.length > 0) return e(console.error(stderr))
            r(stdout)
        })
    })
    /*const parseLine = (line: string): Device | void => {
        var m = regex_xinput.exec(line)
        if (!m || !m.groups) return console.log("error parsing line: " + line)
        var type = m.groups.type
        if (type != "keyboard" && type != "pointer") return console.log("invalid type: " + type)
        return {
            attached: [],
            master: m.groups.master == "master",
            name: m.groups.name,
            type,
            id: 0
        }
    }*/
    var pairs: Device[][] = []
    var floating: Device[] = []

    var c_master: Device | undefined;
    var c_pair: Device[] | undefined;
    for (const line of res.split("\n")) {
        if (line.length == 0) continue

        var [rname, rid, rd] = line.split("\t");
        var mname = (/[⎡⎣⎜]? +(?<name>.+) +/g).exec(rname)
        var mid = /id=(?<id>\d+)/g.exec(rid)
        var md = /\[(?<master>(master|slave)) +(?<type>keyboard|pointer) +\(\d+\)\]/g.exec(rd)
        var dev: Device = {
            name: mname?.groups?.name.trim() || "",
            id: parseInt(mid?.groups?.id || "-1"),
            master: md?.groups?.master == "master",
            type: md?.groups?.type || "",
            attached: [],
            floating: rname.trim().startsWith("~")
        }
        if (rname.startsWith("⎡")) c_pair = [dev]
        if (rname.startsWith("⎣")) {
            if (!c_pair) throw new Error("WTF. 234123894817");
            c_pair.push(dev)
            pairs.push(c_pair)
            c_pair = undefined
        }
        // TODO
        /*if (dev.master || dev.floating) {
            if (c_master && !c_pair) {
                floating.push(c_master)
                c_master = undefined
            }
        }*/
        if (dev.master) {
            c_master = dev
        }
        if (!dev.floating && !dev.master) {
            c_master?.attached.push(dev)
        }
        if (!dev.master) dev.name = dev.name.substr(1).trim()
    }

    return {
        pairs,
        floating
    }
}

var managedMasters: {name: string, devstr: string}[] = []

function getAllNonMasterDevs(inputs: XInputs): Device[] {
    var all: Device[] = []
    for (const pair of inputs.pairs) {
        for (const n of pair) {
            for (const dev of n.attached) {
                all.push(dev)
            }
        }
    }
    for (const dev of inputs.floating) {
        all.push(dev)
    }
    return all
}

async function main() {
    var last:XInputs = await xinput() 
    //console.log(inspect(res, { showHidden: false, depth: null }))
    setInterval(async () => {
        var res = await xinput()
        var dev_all_new = getAllNonMasterDevs(res).filter(d => d.name.endsWith("Mouse"));
        var dev_all_last = getAllNonMasterDevs(last).filter(d => d.name.endsWith("Mouse"));
        var dev_added = dev_all_new.filter(nd => !dev_all_last.find(od => nd.name == od.name))
        var dev_removed = dev_all_last.filter(nd => !dev_all_new.find(od => nd.name == od.name))
        for (const d of dev_added) {
            var name = `m${managedMasters.length}`
            managedMasters.push({name,devstr: d.name})
            console.log(`Create master ${name}`);
            execSafe(`xinput create-master '${name}'`)
            console.log(`Attach ${d.name} to ${name}`);
            execSafe(`xinput reattach '${d.name}' '${name} pointer'`)
        }
        for (const d of dev_removed) {
            var name = `m${managedMasters.length}`
            var [r] = managedMasters.splice(managedMasters.findIndex(m => m.devstr == d.name),1)
            console.log(`Remove master ${r.name}`);
            execSafe(`xinput remove-master '${r.name} pointer'`)
        }
        last = res;

    }, 1000)
}
main()

async function execSafe(c: string) {
    await new Promise<void>((r) => {
        exec(c,(err,stdout,stderr) => {
            if (stderr) console.log(stderr);
            if (err) console.log(err)
            r()            
        })
    })
}