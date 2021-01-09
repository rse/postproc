#!/usr/bin/env node
/*!
**  PostProc -- Post-Process Output of Program
**  Copyright (c) 2020-2021 Dr. Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  own package information  */
const my          = require("./package.json")

/*  internal requirements  */
const fs          = require("fs")

/*  external requirements  */
const yargs       = require("yargs")
const execa       = require("execa")
const byline      = require("byline")
const chalk       = require("chalk")
const Tokenizr    = require("tokenizr")
const moment      = require("moment")
const ansiStyles  = require("ansi-styles")
const tail        = require("tail")

/*  establish asynchronous context  */
;(async () => {
    /*  command-line option parsing  */
    const argv = yargs()
        /* eslint indent: off */
        .parserConfiguration({
            "duplicate-arguments-array": true,
            "set-placeholder-key":       true,
            "flatten-duplicate-arrays":  true,
            "camel-case-expansion":      true,
            "strip-aliased":             false,
            "dot-notation":              false,
            "halt-at-non-option":        true
        })
        .usage("Usage: postproc [-h|--help] [-V|--version] [-C|--chdir <directory>] [-i|--inject <file>] [-e|--execute <rule>] <command> ...")
        .option("h", {
            describe: "show program help information",
            alias:    "help", type: "boolean", default: false
        })
        .option("V", {
            describe: "show program version information",
            alias:    "version", type: "boolean", default: false
        })
        .option("C", {
            describe: "directory to change to before executing command",
            alias:    "change-directory", type: "string", nargs: 1, default: process.cwd()
        })
        .option("i", {
            describe: "inject output from pipe/file into stdout/stderr streams",
            alias:    "inject", type: "string", nargs: 1, default: []
        })
        .option("e", {
            describe: "rule to execute",
            alias:    "execute", type: "string", nargs: 1, default: []
        })
        .version(false)
        .strict(true)
        .showHelpOnFail(true)
        .demand(0)
        .parse(process.argv.slice(2))

    /*  short-circuit processing of "-V" command-line option  */
    if (argv.version) {
        process.stderr.write(`${my.name} ${my.version} <${my.homepage}>\n`)
        process.stderr.write(`${my.description}\n`)
        process.stderr.write(`Copyright (c) 2020 ${my.author.name} <${my.author.url}>\n`)
        process.stderr.write(`Licensed under ${my.license} <http://spdx.org/licenses/${my.license}.html>\n`)
        process.exit(0)
    }

    /*  fix array option handling of yargs  */
    if (typeof argv.execute === "string")
        argv.execute = [ argv.execute ]
    if (typeof argv.inject === "string")
        argv.inject = [ argv.inject ]

    /*  sanity check command-line arguments  */
    if (argv._.length < 1)
        throw new Error("invalid number of arguments")
    const cmd   = argv._[0]
    const args  = argv._.slice(1)
    const chdir = argv.changeDirectory

    /*  parse named pipe usage  */
    argv.inject = argv.inject.map((spec) => {
        const m = spec.match(/^(stdout|stderr):(.+)$/)
        if (m === null)
            throw new Error("invalid injection specification")
        return { stream: m[1], path: m[2] }
    })

    /*  parse a single rule  */
    const parseRule = (rule) => {
        const lexer = new Tokenizr()
        lexer.rule("condition", /(!?)\/((?:\\\/|[^/])+)\//, (ctx, match) => {
            ctx.accept("condition", { type: "regexp", not: !!match[1], regexp: new RegExp(match[2]) })
        })
        lexer.rule("condition", /(!?)#([a-zA-Z][a-zA-Z0-9]*)/, (ctx, match) => {
            ctx.accept("condition", { type: "tag", not: !!match[1], tag: match[2] })
        })
        lexer.rule("condition", /\s+/, (ctx, match) => {
            ctx.ignore()
        })
        lexer.rule("condition", /:/, (ctx, match) => {
            ctx.state("action")
            ctx.ignore()
        })
        lexer.rule("action", /"((?:\\"|[^\r\n])*)"/, (ctx, match) => {
            ctx.accept("action", { type: "replace", string: match[1].replace(/\\"/g, "\"") })
        })
        lexer.rule("action", /(!?)#([a-zA-Z][a-zA-Z0-9]*)/, (ctx, match) => {
            ctx.accept("action", { type: "tag", not: !!match[1], tag: match[2] })
        })
        lexer.rule("action", /(repeat|break|ignore)/, (ctx, match) => {
            ctx.accept("action", { type: "command", command: match[1] })
        })
        lexer.rule("action", /\s+/, (ctx, match) => {
            ctx.ignore()
        })
        lexer.input(rule)
        lexer.state("condition")
        lexer.debug(false)
        return lexer.tokens()
    }

    /*  parse all rules  */
    const rules = []
    argv.execute.forEach((arg) => {
        const tokens = parseRule(arg)
        const rule = { conditions: [], actions: [] }
        tokens.forEach((token) => {
            if (token.type === "condition")
                rule.conditions.push(token.value)
            else if (token.type === "action")
                rule.actions.push(token.value)
        })
        if (rule.actions.length === 0)
            throw new Error(`invalid rule "${arg}": action(s) missing`)
        rules.push(rule)
    })

    /*  process a line of output  */
    const processLine = (line, tags) => {
        /*  repeat entry point  */
        let repeat = true
        while (repeat) {
            repeat = false
            repeated: {
                /*  iterate over all rules  */
                for (const rule of rules) {
                    /*  check whether all conditions matched  */
                    let matched = true
                    let capture = null
                    for (const condition of rule.conditions) {
                        if (condition.type === "tag") {
                            /*  tag: !#foo or #foo  */
                            if (!(   ( condition.not && !tags[condition.tag])
                                  || (!condition.not &&  tags[condition.tag]))) {
                                matched = false
                                break
                            }
                        }
                        else if (condition.type === "regexp") {
                            /*  regexp !/foo/ or /foo/  */
                            capture = condition.regexp.exec(line)
                            if (!(   ( condition.not && !capture)
                                  || (!condition.not &&  capture))) {
                                matched = false
                                break
                            }
                        }
                        if (!matched)
                            break
                    }

                    /*  if all conditions matched, process the actions  */
                    if (matched) {
                        /*  provide capture fallback  */
                        if (capture === null) {
                            capture = [ line ]
                            capture.index = 0
                            capture.input = line
                        }

                        /*  iterate over all actions  */
                        for (const action of rule.actions) {
                            if (action.type === "command") {
                                /*  process commands: repeat, break or ignore  */
                                if (action.command === "repeat") {
                                    repeat = true
                                    break repeated
                                }
                                else if (action.command === "break") {
                                    repeat = false
                                    break repeated
                                }
                                else if (action.command === "ignore") {
                                    repeat = false
                                    line = null
                                    break repeated
                                }
                            }
                            else if (action.type === "tag") {
                                /*  process tag: !#foo or #foo  */
                                if (action.not)
                                    delete tags[action.tag]
                                else
                                    tags[action.tag] = true
                            }
                            else if (action.type === "replace") {
                                /*  process replace: "foo"  */
                                let replacer = action.string
                                replacer = replacer
                                    /*  replace "$N"  */
                                    .replace(/\$(\d)/g, (m, num) => {
                                        num = parseInt(num)
                                        return (capture[num] !== undefined ? capture[num] : "")
                                    })
                                    /*  replace "%x(...)"  */
                                    .replace(/%([ct])(?:\((.+?)\))?/g, (m, func, args) => {
                                        let result = ""
                                        args = args ? args.split(/\s*,\s*/) : []
                                        if (func === "c") {
                                            if (args.length === 0)
                                                args = [ "red" ]
                                            let style = ansiStyles
                                            for (const arg of args) {
                                                if (style[arg] === undefined)
                                                    throw new Error(`invalid style "${arg}"`)
                                                style = style[arg]
                                            }
                                            result = style.open
                                        }
                                        else if (func === "t") {
                                            if (args.length === 0)
                                                args = [ "YYYY-MM-DD hh:mm:ss.SS" ]
                                            result = moment().format(...args)
                                        }
                                        return result
                                    })

                                /*  reassemble line  */
                                line =
                                    line.substring(0, capture.index) +
                                    replacer +
                                    line.substring(capture.index + capture[0].length)
                            }
                        }
                    }
                }
            }
        }
        return line
    }

    /*  the global tag store  */
    const stdoutTags = { stdout: true }
    const stderrTags = { stderr: true }

    /*  optionally listen on named pipes  */
    for (const inject of argv.inject) {
        const stats = await fs.promises.stat(inject.path).catch(() => null)
        if (stats === null)
            throw new Error(`invalid injection path "${inject.path}": cannot access`)
        if (stats.isFIFO()) {
            const stream = byline(fs.createReadStream(inject.path, { encoding: "utf8" }))
            stream.on("data", (line) => {
                line = line.toString()
                line = processLine(line, inject.stream === "stdout" ? stdoutTags : stderrTags)
                if (line !== null)
                    process[inject.stream].write(`${line}\n`)
            })
        }
        else if (stats.isFile()) {
            const stream = new tail.Tail(inject.path, { follow: true, encoding: "utf8" })
            stream.on("line", (line) => {
                line = line.toString()
                line = processLine(line, inject.stream === "stdout" ? stdoutTags : stderrTags)
                if (line !== null)
                    process[inject.stream].write(`${line}\n`)
            })
        }
        else
            throw new Error(`invalid injection path "${inject.path}": neither fifo/pipe nor file`)
    }

    /*  fork off shell command  */
    const proc = execa(cmd, args, {
        stripFinalNewline: false,
        stdio:  [ "inherit", "pipe", "pipe" ],
        reject: false,
        cwd:    chdir
    })

    /*  post-process stdout/stderr of command  */
    const streams = [ "stdout", "stderr" ]
    streams.forEach((name) => {
        const stream = byline.createStream(proc[name])
        stream.on("data", (line) => {
            line = line.toString()
            line = processLine(line, name === "stdout" ? stdoutTags : stderrTags)
            if (line !== null)
                process[name].write(`${line}\n`)
        })
    })

    /*  wait for command to exit and pass-through exit code  */
    const result = await proc
    if (result.exitCode === undefined)
        throw new Error(result.originalMessage)
    process.exit(result.exitCode)
})().catch((err) => {
    /*  handle fatal error  */
    process.stderr.write(`postproc: ${chalk.red("ERROR:")} ${err}\n`)
    process.exit(1)
})

