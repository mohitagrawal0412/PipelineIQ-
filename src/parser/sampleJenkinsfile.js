const SAMPLE_JENKINSFILE = `
pipeline {
    agent {
        docker {
            image 'novapay-docker.jfrog.io/build-tools/maven:3.9-jdk17'
            args '-v /root/.m2:/root/.m2 -v /var/run/docker.sock:/var/run/docker.sock --net=host'
        }
    }

    options {
        timeout(time: 3, unit: 'HOURS')
        retry(2)
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        ansiColor('xterm')
    }

    triggers {
        pollSCM('H/15 * * * *')
        cron('0 2 * * *')
    }

    parameters {
        choice(name: 'DEPLOY_ENV', choices: ['dev', 'staging', 'production'], description: 'Target deployment environment')
        choice(name: 'AWS_REGION', choices: ['us-east-1', 'us-west-2', 'eu-west-1'], description: 'AWS deployment region')
        booleanParam(name: 'RUN_SECURITY_SCAN', defaultValue: true, description: 'Force deep security & vulnerability scans')
        booleanParam(name: 'RUN_PERF_TESTS', defaultValue: false, description: 'Run JMeter performance regression test suite')
        booleanParam(name: 'NOTIFY_SLACK', defaultValue: true, description: 'Send pipeline notification updates to Slack')
        string(name: 'VERSION_OVERRIDE', defaultValue: '', description: 'Custom release version override (e.g., 2.4.1-patch)')
    }

    environment {
        APP_NAME           = 'payment-gateway'
        REGISTRY_URL       = 'novapay-docker.jfrog.io/fintech'
        IMAGE_TAG          = "\${params.VERSION_OVERRIDE != '' ? params.VERSION_OVERRIDE : env.BUILD_NUMBER}"
        SONAR_HOST_URL     = 'https://sonarqube.novapay-internal.net'
        SONAR_PROJECT_KEY  = 'novapay-payment-gateway'
        K8S_NAMESPACE      = "\${params.DEPLOY_ENV == 'production' ? 'prod-payments' : 'staging-payments'}"
        ARTIFACT_CREDENTIALS = credentials('jfrog-artifactory-credentials')
        HELM_CREDENTIALS   = credentials('k8s-cluster-auth-token')
        PAGERDUTY_KEY      = credentials('pagerduty-integration-key')
    }

    stages {
        stage('Checkout & Workspace Setup') {
            steps {
                echo 'Initializing payment-gateway pipeline run'
                sh 'echo "Checking workspace integrity and system tools..."'
                sh 'mvn --version'
                sh 'docker --version'
                sh 'kubectl version --client || true'
                sh 'git log -1 --stat'
                stash includes: '**/*', name: 'full-source'
            }
        }

        stage('Dependency Resolution & Cache') {
            steps {
                sh 'echo "Pre-fetching Maven dependencies to verify lockfiles..."'
                sh 'mvn dependency:go-offline -B -DoutputFile=target/deps.txt'
                sh 'ls -la ~/.m2/repository'
            }
        }

        stage('Compile & Build') {
            steps {
                sh 'echo "Compiling application modules..."'
                sh 'mvn clean compile -DskipTests -B'
                stash includes: 'target/**/*.class', name: 'compiled-classes'
            }
        }

        stage('Unit Tests') {
            steps {
                sh 'echo "Running JUnit 5 unit test suite..."'
                sh 'mvn test -Dtest=*UnitTest -B -Dmaven.test.failure.ignore=true'
            }
            post {
                always {
                    junit '**/target/surefire-reports/*.xml'
                    archiveArtifacts artifacts: '**/target/surefire-reports/*', allowEmptyArchive: true
                }
            }
        }

        stage('Code Quality Gates') {
            parallel {
                stage('SonarQube Analysis') {
                    steps {
                        sh 'echo "Triggering SonarQube quality analysis..."'
                        sh 'mvn sonar:sonar -Dsonar.host.url=\${SONAR_HOST_URL} -Dsonar.projectKey=\${SONAR_PROJECT_KEY} -Dsonar.branch.name=\${BRANCH_NAME} -B'
                    }
                }
                stage('OWASP Dependency Check') {
                    steps {
                        sh 'echo "Scanning third-party components for CVEs..."'
                        sh 'mvn org.owasp:dependency-check-maven:check -Dformat=XML -Dout=target/owasp-report -B || true'
                    }
                    post {
                        always {
                            publishHTML(target: [allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true, reportDir: 'target/owasp-report', reportFiles: 'dependency-check-report.html', reportName: 'OWASP Dependency Report'])
                        }
                    }
                }
                stage('License Compliance Scan') {
                    steps {
                        sh 'echo "Validating open-source licenses against NovaPay compliance policy..."'
                        sh 'mvn license:add-third-party -Dlicense.excludedTypes=gpl -B || echo "License warnings detected"'
                    }
                }
                stage('Code Coverage with JaCoCo') {
                    steps {
                        sh 'echo "Calculating code coverage targets..."'
                        sh 'mvn jacoco:report -B'
                    }
                    post {
                        always {
                            publishHTML(target: [allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true, reportDir: 'target/site/jacoco', reportFiles: 'index.html', reportName: 'JaCoCo Coverage Report'])
                        }
                    }
                }
            }
        }

        stage('Integration Tests') {
            when {
                expression { return params.RUN_SECURITY_SCAN == true }
            }
            agent {
                docker {
                    image 'novapay-docker.jfrog.io/build-tools/integration-runner:2.1'
                    args '--net=host'
                }
            }
            options {
                timeout(time: 45, unit: 'MINUTES')
            }
            steps {
                sh 'echo "Spinning up dynamic test container environment..."'
                sh 'docker run -d --name test-postgres -e POSTGRES_PASSWORD=secret postgres:15-alpine'
                sh 'mvn verify -Pintegration-tests -Dpostgres.host=localhost -B || true'
                sh 'docker rm -f test-postgres || true'
            }
            post {
                always {
                    junit '**/target/failsafe-reports/*.xml'
                }
            }
        }

        stage('Contract Tests') {
            when {
                branch 'develop'
            }
            steps {
                sh 'echo "Executing Pact provider verification against NovaPay consumer contracts..."'
                sh 'mvn pact:verify -Dpact.verifier.publishResults=true -B'
            }
        }

        stage('Docker Image Build & Tag') {
            steps {
                sh 'echo "Building Docker container image..."'
                sh 'docker build --build-arg BUILD_NUMBER=\${BUILD_NUMBER} --build-arg GIT_COMMIT=\${GIT_COMMIT} -t \${REGISTRY_URL}/\${APP_NAME}:\${IMAGE_TAG} -t \${REGISTRY_URL}/\${APP_NAME}:latest .'
            }
        }

        stage('Container Security Scan') {
            when {
                branch 'main'
            }
            steps {
                sh 'echo "Running Trivy container vulnerability scanner..."'
                sh 'trivy image --severity HIGH,CRITICAL --exit-code 0 \${REGISTRY_URL}/\${APP_NAME}:\${IMAGE_TAG} > target/trivy-scan.txt'
                archiveArtifacts artifacts: 'target/trivy-scan.txt', allowEmptyArchive: true
            }
        }

        stage('Push to Artifact Registry') {
            when {
                branch 'main'
            }
            steps {
                sh 'echo "Authenticating with JFrog Artifactory..."'
                sh 'docker push \${REGISTRY_URL}/\${APP_NAME}:\${IMAGE_TAG}'
                sh 'docker push \${REGISTRY_URL}/\${APP_NAME}:latest'
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'staging'
            }
            options {
                timeout(time: 30, unit: 'MINUTES')
            }
            steps {
                sh 'echo "Deploying payment-gateway to Kubernetes Staging..."'
                sh 'helm upgrade --install \${APP_NAME}-staging ./helm/payment-gateway --namespace \${K8S_NAMESPACE} --set image.repository=\${REGISTRY_URL}/\${APP_NAME} --set image.tag=\${IMAGE_TAG} --wait --timeout 10m'
                input message: 'Staging deployment complete. Approve to proceed?'
            }
        }

        stage('Smoke Tests on Staging') {
            when {
                branch 'staging'
            }
            steps {
                sh 'echo "Executing HTTP synthetic smoke tests on Staging endpoint..."'
                sh 'curl -sf http://staging.internal.novapay.com/payment-gateway/health || exit 1'
                sh 'curl -sf http://staging.internal.novapay.com/payment-gateway/actuator/info || exit 1'
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'release/*'
            }
            agent {
                docker {
                    image 'novapay-docker.jfrog.io/build-tools/k8s-deployer:v1.28'
                }
            }
            options {
                timeout(time: 1, unit: 'HOURS')
            }
            steps {
                input message: 'CRITICAL: Deploying payment-gateway to PRODUCTION. Proceed?'
                sh 'echo "Initiating zero-downtime Canary Deployment to Production Kubernetes..."'
                sh 'kubectl config set-context --current --namespace=\${K8S_NAMESPACE}'
                sh 'helm upgrade --install \${APP_NAME}-prod ./helm/payment-gateway --namespace \${K8S_NAMESPACE} --set image.repository=\${REGISTRY_URL}/\${APP_NAME} --set image.tag=\${IMAGE_TAG} --set replicaCount=12 --wait --timeout 15m'
            }
        }

        stage('Post-Deploy Health Checks') {
            when {
                branch 'release/*'
            }
            steps {
                sh 'echo "Verifying deployment pods status and transaction processing status..."'
                sh 'kubectl rollout status deployment/payment-gateway-prod -n prod-payments'
                sh 'curl -sf https://api.novapay.com/payment-gateway/health/liveness'
                sh 'curl -sf https://api.novapay.com/payment-gateway/health/readiness'
            }
        }

        stage('Performance Regression Tests') {
            when {
                expression { return params.RUN_PERF_TESTS == true }
            }
            steps {
                sh 'echo "Running Apache JMeter stress testing suite against target API..."'
                sh 'jmeter -n -t src/test/jmeter/payment-stress-test.jmx -l target/jmeter-results.jtl -e -o target/jmeter-report'
            }
            post {
                always {
                    publishHTML(target: [allowMissing: true, alwaysLinkToLastBuild: true, keepAll: true, reportDir: 'target/jmeter-report', reportFiles: 'index.html', reportName: 'JMeter Performance Report'])
                }
            }
        }

        stage('Cross-Browser Matrix Tests') {
            matrix {
                axes {
                    axis {
                        name 'BROWSER'
                        values 'chrome', 'firefox', 'safari'
                    }
                    axis {
                        name 'OS'
                        values 'linux', 'mac'
                    }
                }
                excludes {
                    exclude {
                        axis {
                            name 'BROWSER'
                            values 'safari'
                        }
                        axis {
                            name 'OS'
                            values 'linux'
                        }
                    }
                }
                stages {
                    stage('Run UI Tests') {
                        steps {
                            echo "Running E2E tests on \${OS} using \${BROWSER}"
                            sh 'npm run cypress:run -- --env browser=\${BROWSER},os=\${OS}'
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            echo 'Cleaning up workspace and temporary Docker containers...'
            sh 'docker system prune -f --filter "label=stage=temporary" || true'
        }
        success {
            echo 'Pipeline SUCCESS: payment-gateway build completed'
            slackSend channel: '#devops-deployments', message: 'Pipeline SUCCESS: payment-gateway'
            mail to: 'dev-team@novapay.com', subject: 'Build Success: payment-gateway', body: 'Build completed successfully.'
        }
        failure {
            echo 'CRITICAL: Pipeline run failed!'
            slackSend channel: '#devops-deployments', message: 'ALERT: Payment Gateway pipeline FAILED'
            sh 'curl -X POST https://events.pagerduty.com/v2/enqueue -H "Content-Type: application/json" -d "{\\"routing_key\\":\\"pagerduty-key\\",\\"event_action\\":\\"trigger\\",\\"payload\\":{\\"summary\\":\\"Pipeline Failure: payment-gateway\\",\\"severity\\":\\"critical\\",\\"source\\":\\"Jenkins CI/CD\\"}}" || true'
        }
        unstable {
            echo 'Pipeline completes with UNSTABLE status (test failures detected).'
        }
    }
}
`;

export default SAMPLE_JENKINSFILE;
