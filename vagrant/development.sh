#!/usr/bin/env bash

if [ ! -e /etc/vagrant/development ]
then

	echo ">>> setting up the development tools"

	# install gulp
	npm install -g gulp

	# only run once
    touch /etc/vagrant/development

else

	echo ">>> development tools already development..."

fi
