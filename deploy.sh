#!/bin/sh

bold=$(tput bold)
normal=$(tput sgr0)

# check for uncommitted changes
diff=`git diff`

if [ ! -z "$diff" ]
then
	echo "${bold}You have uncommitted changes. Bailing out.${normal}"
	exit 0
fi

# create bundle
git archive -o bundle.zip HEAD

# since git archive ignores, add config.js
zip bundle.zip config.js

# push to AWS
aws lambda update-function-code --function-name jobscraper --zip-file fileb://bundle.zip --publish

# cleanup
rm bundle.zip

echo "${bold}Done deploying!${normal}"
exit 0
