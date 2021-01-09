
postproc
========

**Post-Process Output of Program**

<p/>
<img src="https://nodei.co/npm/postproc.png?downloads=true&stars=true" alt=""/>

<p/>
<img src="https://david-dm.org/rse/postproc.png" alt=""/>

Abstract
--------

`postproc`(1) is a small utility for flexibly post-processsing the
`stdout` and `stderr` outputs of shell commands. It applies one or more
post-processing rules to each line of output. Each rule can have zero or
more conditions and one or more actions. The conditions allow to match
the output line with the help of regular expressions or active tags. The
actions allow to change the output line with the help of replacement
strings, can add or delete active tags and can force the repeating or
stopping of the rules for the current line and can force the ignoring of
the current line.

Installation
------------

```
$ npm install -g postproc
```

Usage
-----

The [Unix manual page](https://github.com/rse/postproc/blob/master/postproc.md) contains
detailed usage information.

Examples
--------

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

License
-------

Copyright &copy; 2020-2021 Dr. Ralf S. Engelschall (http://engelschall.com/)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

