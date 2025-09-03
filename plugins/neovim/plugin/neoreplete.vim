" This is the entrypoint to the plugin. It defers to a Lua module, which does
" all the real work.

lua replete = require("replete")

" Define some keyboard shortcuts. The "eval" shortcuts are available in both
" visual and non-visual mode, so that you can use them repetitively.

command Replete normal! :lua replete.toggle()<CR>
nmap <M-b> :lua replete.eval("browser")<CR>
nmap <M-n> :lua replete.eval("node")<CR>
nmap <M-d> :lua replete.eval("deno")<CR>
nmap <M-u> :lua replete.eval("bun")<CR>
nmap <M-t> :lua replete.eval("tjs")<CR>
vnoremap <M-b> :lua replete.eval("browser")<CR>
vnoremap <M-n> :lua replete.eval("node")<CR>
vnoremap <M-d> :lua replete.eval("deno")<CR>
vnoremap <M-u> :lua replete.eval("bun")<CR>
vnoremap <M-t> :lua replete.eval("tjs")<CR>

" If we neglect to kill the Replete process, then it outlives nvim. Register an
" event handler to be called just before nvim exits, killing Replete.

autocmd VimLeavePre * :lua replete.stop()
