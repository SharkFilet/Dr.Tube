#!/bin/bash
cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:3737") &
node server.mjs
