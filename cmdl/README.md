# The CMDL

The CMDL provides a means of evaluating JavaScript source code in isolated processes.

The CMDL is not a security feature. It should not be used to run untrusted code. Evaluated code will be able to read and write to disk, access the network and start new processes.

The CMDL is in the public domain.

## Structure

A CMDL instance instructs a single padawan. A __padawan__ is a process which is used as an isolated execution environment. If a padawan dies, it is resurrected immediately.

                     +----------------------------+      
                     |                            |      
                     |            CMDL            |      
                     | (within a Node.js process) |      
                     |                            |      
                     +---------+--------^---------+      
                               |        |
                              eval    report
                               |        |
                     +---------v--------+---------+
                     |                            |
                     |           Padawan          |
                     |    (a separate process)    |
                     |                            |
                     +----------------------------+
