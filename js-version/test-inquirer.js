import inquirer from "inquirer";

async function main() {
  try {
    console.log("Starting test...");
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "test",
        message: "Enter something to test:",
        default: "test",
      },
    ]);

    console.log("You entered:", answers.test);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
