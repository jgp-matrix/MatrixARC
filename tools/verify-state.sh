#!/usr/bin/env bash
# Session startup state verification.
# Prints working directory, branch, recent commits, and working-tree status
# so a fresh Claude session can confirm it's where it expects before doing work.

set -u

print_header() {
  echo
  echo "=== $1 ==="
}

print_header "pwd"
pwd

print_header "git branch --show-current"
git branch --show-current

print_header "git log --oneline -5"
git log --oneline -5

print_header "git status"
git status
