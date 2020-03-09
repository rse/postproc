
# postproc(1) -- Post-Process Output of Command

## SYNOPSIS

`postproc` `-e` *rule* [...] *command* [...]

## DESCRIPTION

`postproc`(1) is a small utility for flexibly post-processsing the
`stdout` and `stderr` outputs of shell commands. It applies one or more
post-processing rules to each line of output. Each rule can have zero or
more conditions and one or more actions. The conditions allow to match
the output line with the help of regular expressions or active tags. The
actions allow to change the output line with the help of replacement
strings, can add or delete active tags and can force the repeating or
stopping of the rules for the current line and can force the ignoring of
the current line.

## RULE SYNTAX GRAMMAR

```
rule      ::= condition* ":" action+
condition ::= not? regex | not? tag
action    ::= string | not? tag | command
not       ::= "!"
regex     ::= "/" ("\\/" | .)* "/"
tag       ::= "#" /[a-zA-Z][a-zA-Z0-9]*
command   ::= "repeat" | "break" | "ignore"
string    ::= "\"" ("\\\"" | meta | .)* "\""
meta      ::= backref | function
backref   ::= "$" /[0-9]/
function  ::= "%" name ("(" arg? | (arg ("," arg)*) ")")?
name      ::= "c" | "t"
```

The arguments to `%c()` can be any ANSI styles supported by
[ansi-styles](https://github.com/chalk/ansi-styles).
The arguments to `%t()` can be any [time formatting strings](https://momentjs.com/docs/#/displaying/) supported by
[moment.js](https://momentjs.com/).

The `repeat` command repeats the line processing from scratch by
starting from the first rule again. The `break` command stops the line
processing at the current rule by not executing the remaining rules. The
`ignore` command stops the line processing at the current rule by not
executing the remaining rules and ignores the line in the output at all.

## EXAMPLES

```
# adds timestamp prefix
$ postproc -e ': "[%c(blue)%t(YYYY-MM-DD hh:mm:ss.SS)%c(reset)] $0"' \
  npm install

# marks directories as blue
$ postproc -e '/^(d.+\s+)(\S+)$/ : "$1%c(blue)$2/%c(reset)"' \
  ls -l

# complex state-based marking of subsequent line
# postproc -e '/complete log/ : #logfile break' \
           -e '#logfile : "%c(bold)$0%c(reset)" !#logfile' \
  npm install not-existing-module
```

## HISTORY

The `postproc`(1) utility was developed in March 2020 to post-process
the log output of commands under control of supervisord(8). The main
intention was to prefix the outputs with timestamps and unique command
ids.

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

