(defvar replete-command
  (list "deno"
        "run"
        "--allow-all"
        "--importmap"
        "https://deno.land/x/replete/import_map.json"
        "https://deno.land/x/replete/replete.js"
        "--browser_port=9325"
        "--content_type=js:text/javascript"
        "--content_type=mjs:text/javascript"
        "--content_type=css:text/css"
        "--content_type=html:text/html; charset=utf-8"
        "--content_type=wasm:application/wasm"
        "--content_type=woff2:font/woff2"
        "--content_type=svg:image/svg+xml"
        "--content_type=png:image/png"
        "--content_type=webp:image/webp"))
(defvar replete-cwd default-directory)
(defvar replete-buffer "*replete*")
(defvar replete-process nil)
(defvar replete-remnant "")

(defun replete-errorize (value)

; Make a string scary and red.

  (propertize value 'face '(:foreground "red")))

(defun replete-append (value after)

; Append the string 'value' onto the end of Replete's buffer. By specifying
; the window-point-insertion-type behaviour, we ensure that the buffer is
; always scrolled to the end of the output.

  (with-current-buffer replete-buffer
    (set (make-local-variable 'window-point-insertion-type) t)
    (goto-char (point-max))
    (insert value after)))

(defun replete-result (result)

; Handle a result message from Replete.

  (maphash
   (lambda (key value)

; A result message should contain one of the following keys. If it does not,
; nothing happens.

     (pcase key
       ("out"        (replete-append value ""))
       ("err"        (replete-append (replete-errorize value) ""))
       ("exception"  (replete-append (replete-errorize value) "\n"))
       ("evaluation" (replete-append value "\n"))))
   result))

(defun replete-consume ()

; If the remnant contains a newline, then it contains at least one whole
; message.

  (while (string-match-p (regexp-quote "\n") replete-remnant)

; Take the first line from the remnant.
    
    (let* ((lines (split-string replete-remnant "\n"))
           (line (car lines)))
      (replete-result
       (condition-case nil
       
; Attempt to parse the line as a JSON object.

           (json-parse-string line :object-type 'hash-table)

; If the line is not JSON, simulate a result message containing the line as
; stderr.
         
         (error
          (let ((result (make-hash-table)))
            (puthash "err" (concat line "\n") result)
            result))))

; The rest of the lines become the new remnant, which is immediately consumed.
    
      (setq replete-remnant (mapconcat 'identity (cdr lines) "\n")))))

(defun replete-chunk (ignore chunk)

; Upon reading a chunk of text from Replete's stdout (or stderr), it is
; appended onto the remnant. Any whole lines within the remnant are then
; consumed.

  (setq replete-remnant (concat replete-remnant chunk))
  (replete-consume))

(defun replete-stop ()

; Stops the Replete process.

  (interactive)
  (if (process-live-p replete-process)
      (kill-process replete-process)))

(defun replete-start ()

; Starts (or restarts) the Replete process.

  (interactive)
  (if (process-live-p replete-process)
      (replete-stop))
  (setq replete-process
    (let ((default-directory replete-cwd))
      (make-process :name "replete"
                    :buffer replete-buffer
                    :connection-type 'pipe
                    :filter #'replete-chunk
                    :command replete-command))))

(defun replete-eval (platform)

; Evaluate the buffer's selected region on the 'platform'.

  (let* ((beg (region-beginning))
         (end (region-end))
         (selected-code (buffer-substring-no-properties beg end)))

; Send a command message to Replete's stdin.
    
    (process-send-string
     replete-process
     (concat
      (json-serialize (list :platform platform
                            :source selected-code
                            :locator (concat "file://" (buffer-file-name))
                            :scope (buffer-name)))
      "\n"))))


(defun replete-browser ()
  (interactive)
  (replete-eval "browser"))

(defun replete-node ()
  (interactive)
  (replete-eval "node"))

(defun replete-deno ()
  (interactive)
  (replete-eval "deno"))

(defun replete-bun ()
  (interactive)
  (replete-eval "bun"))

(defun replete-tjs ()
  (interactive)
  (replete-eval "tjs"))

(provide 'replete)
