import { promises as fs } from 'fs';
import path from 'path';
import { authOptions } from '../../../auth/[...nextauth]';
import { getServerSession } from 'next-auth/next';
import repoHistory from '../../../../../helpers/functions/repoHistory';
const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);

export default async function handler(req, res) {
    if (req.method == 'PUT') {
        //Verify that the user is logged in.
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            res.status(401).json({ message: 'You must be logged in.' });
            return;
        }

        //The data we expect to receive
        const {
            alias,
            sshPublicKey,
            size,
            comment,
            alert,
            lanCommand,
            appendOnlyMode,
        } = req.body;
        //Only "comment" and "lanCommand" are optional in the form.
        if (
            !alias ||
            !sshPublicKey ||
            !size ||
            typeof appendOnlyMode !== 'boolean' ||
            (!alert && alert !== 0)
        ) {
            res.status(422).json({
                message: 'Unexpected data',
            });
            return;
        }

        try {
            //Find the absolute path of the json directory
            const jsonDirectory = path.join(process.cwd(), '/config');
            let repoList = await fs.readFile(
                jsonDirectory + '/repo.json',
                'utf8'
            );
            //Parse the repoList
            repoList = JSON.parse(repoList);

            //Find the index of the repo in repoList
            //NOTE : req.query.slug return a string, so parseInt to use with indexOf.
            const repoIndex = repoList
                .map((repo) => repo.id)
                .indexOf(parseInt(req.query.slug));

            ////Call the shell : updateRepo.sh
            //Find the absolute path of the shells directory
            const shellsDirectory = path.join(process.cwd(), '/helpers');
            // //Exec the shell
            await exec(
                `${shellsDirectory}/shells/updateRepo.sh ${repoList[repoIndex].repositoryName} "${sshPublicKey}" ${size} ${appendOnlyMode}`
            );

            //Find the ID in the data and change the values transmitted by the form
            let newRepoList = repoList.map((repo) =>
                repo.id == req.query.slug
                    ? {
                          ...repo,
                          alias: alias,
                          sshPublicKey: sshPublicKey,
                          storageSize: Number(size),
                          comment: comment,
                          alert: alert,
                          lanCommand: lanCommand,
                          appendOnlyMode: appendOnlyMode,
                      }
                    : repo
            );
            //History the new repoList
            await repoHistory(newRepoList);
            //Stringify the newRepoList to write it into the json file.
            newRepoList = JSON.stringify(newRepoList);
            //Write the new json
            await fs.writeFile(
                jsonDirectory + '/repo.json',
                newRepoList,
                (err) => {
                    if (err) console.log(err);
                }
            );

            res.status(200).json({ message: 'Envoi API réussi' });
        } catch (error) {
            //Log for backend
            console.log(error);
            //Log for frontend
            if (error.code == 'ENOENT') {
                res.status(500).json({
                    status: 500,
                    message: 'No such file or directory',
                });
            } else {
                res.status(500).json({
                    status: 500,
                    message: error.stdout,
                });
            }
            return;
        }
    } else {
        res.status(405).json({
            status: 405,
            message: 'Method Not Allowed ',
        });
    }
}
